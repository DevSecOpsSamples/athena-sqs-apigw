
# Retry Athena query with SQS and API Gateway

Athena 쿼리 동시 실행 Quota에 의해 쓰로틀링 에러가 발생할 수 있습니다. API Gateway를 통해 쿼리 실행을 SQS에 저장해서 Lambda로 실행하고 쓰로틀링에러 발생시 dead letter SQS에 저장하고 재실행 합니다.

Service Quotas https://docs.aws.amazon.com/ko_kr/athena/latest/ug/service-limits.html:

```
DML 또는 DDL 쿼리 할당량은 실행 중인 쿼리와 대기 중인 쿼리를 모두 포함합니다. 예를 들어 DML 쿼리 할당량이 25이고 실행 중인 쿼리와 대기 중인 쿼리의 합계가 26인 경우 쿼리 26은 TooManyRequestsException 오류를 발생시킵니다.
```

![cloudwatch-metric](./screenshots/cloudwatch-metric.png?raw=true)
## Quota

| Region    | Quota name         | AWS default quota value | Adjustable |
|-----------|--------------------|--------------|--------------|
| us-east-1 | Active DDL queries | 20  |  Yes |
| us-east-1 | Active DML queries | 200 |  Yes |
| us-east-1 | DDL query timeout  | 600 |  Yes |
| us-east-1 | DML query timeout  | 30  |  Yes |

Throttling error message:

```bash
An error occurred (TooManyRequestsException) when calling the StartQueryExecution operation: You have exceeded the limit for the number of queries you can run concurrently. Please reduce the number of concurrent queries submitted by this account. Contact customer support to request a concurrent query limit increase.
```

## Prerequisites

```bash
npm install -g aws-cdk@2.22.0
npm install

export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-east-1
```

Use the `cdk` command-line toolkit to interact with your project:

* `cdk deploy`: deploys your app into an AWS account
* `cdk synth`: synthesizes an AWS CloudFormation template for your app
* `cdk diff`: compares your app with the deployed stack
* `cdk watch`: deployment every time a file change is detected

### CDK deploy

```bash
# git repository root
cdk deploy
```

### Resources

모든 리소스는 athena-query-local, athena-query-dev 및 athena-query-stg와 같이 {stage} 접미사를 사용합니다.

| Service       | Name                        | Description  |
|---------------|-----------------------------|--------------|
| API Gateway   | /athena/query API           | Athena 쿼리를 queue에 추가하는 RESTFul API. API endpoint: `https://<random-id>.execute-api.<region>.amazonaws.com/dev//athena/query`        |
| SQS           | athena-query            | Athena 쿼리 실행 queue 입니다.            |
| SQS           | athena-query-deadletter | Athena query SQS의 처리하지 못한 queue입니다. athena-query-executor Lambda에서 조절 오류가 발생하면 Athena 쿼리를 대기열에 넣습니다.     |
| Lambda        | [athena-query-receiver](./lambda/query-receiver/query_receiver.py)   | API Gateway에서 Athena 쿼리를 수신하고 'athena-query' SQS에 메시지를 대기열에 넣습니다.     |
| Lambda        | [athena-query-executor](./lambda/query-executor/query_executor.py)   | 이벤트 소스(athena-query Lambda)에서 수신한 Athena 쿼리를 실행합니다.     |
| Lambda        | [athena-deadletter-query-executor](./lambda/query-executor/deadletter_batch.py) | athena-query-deadletter 메시지를 처리하는 배치 Lambda 입니다.        |
| EventBridge Rule | athena-deadletter-query-executor     | 매분마다 athena-dead letter-query-execute Lambda를 실행합니다. [EventBus Rule menu](https://ap-northeast-2.console.aws.amazon.com/events/home?region=ap-northeast-2#/eventbus/default/rules/)     |
| S3 Bucket     | athena-{account-id}     | Athena query output bucket      |

* [lambda/query-executor/app/athena.py](./lambda/query-executor/app/athena.py)
* [lambda/query-executor/app/sqs.py](./lambda/query-executor/app/sqs.py)

### Flow

1. User > API Gateway(/athena/query API) > Lambda (athena-query-receiver) > SQS (athena-query)
2. Query executor Lamda(athena-query-executor)는 athena-query SQS에서 쿼리 메시지를 처리합니다.
3. athena-query-executor Lambda에서 throttling 오류가 발생할 때 Athena 쿼리를 대기열에 넣습니다.

   SQS (athena-query) > Lambda (athena-query-executor) > SQS (athena-query-deadletter)

4. dead leatter SQS(athena-query-deadletter)에서 Athena 쿼리를 일괄 처리하는 Lambda(athena-deadletter-query-executor) 를 EventBridge Rule을 통해 1분 간격으로 실행합니다.

   SQS (athena-query-deadletter) > Lambda (athena-deadletter-query-executor) > SQS (athena-query)로 enqueue

# CloudWatch Metric

## AWS Metric

Enable `Publish query metrics to AWS CloudWatch` on Workgroups > primary > Settings > Metrics menu.

https://docs.aws.amazon.com/ko_kr/athena/latest/ug/query-metrics-viewing.html

| Metric                | Description        |
|-----------------------|--------------------|
| TotalExecutionTime    | Athena가 DDL 또는 DML 쿼리를 실행하는 데 걸린 시간(밀리초)입니다. TotalExecutionTime에는 QueryQueueTime, QueryPlanningTime, EngineExecutionTime 및 ServiceProcessingTime이 포함됩니다. |
| QueryQueueTime        | 쿼리가 리소스를 기다리면서 쿼리 대기열에 있던 시간(밀리초) 입니다.  |
| QueryPlanningTime     | Athena가 쿼리 처리 흐름을 계획하는 데 걸린 시간(밀리초)입니다.          |
| EngineExecutionTime   | 쿼리를 실행하는 데 걸린 시간(밀리초)입니다. |
| ServiceProcessingTime | 쿼리 엔진이 쿼리 실행을 완료한 후 Athena가 쿼리 결과를 처리하는 데 걸린 시간(밀리초)입니다. |
| ProcessedBytes        | DML 쿼리당 Athena가 스캔한 바이트 수입니다 |

## Custom Metric

AWS에서 제공하는 Athena metric은 쿼리 실행 횟수와 에러 횟수에 대한 metric을 제공하지 않으며 SQS에서 athena query를 시작 또는 재시작시 custom metric을 저장합니다.

`athena-query` > `athena-query-deadletter` 또는 `athena-query-deadletter` > `athena-query` 로 message 이동시 Custom Metric을 생성하기 위해 SQS의 dead letter 대기열 기능이 아닌 code로 처리합니다.

| Metric               | Description        |
|----------------------|--------------------|
| StartQueryCount      | `athena-query-executor` Lambda에서 start_query_execution 함수가 호출된 횟수입니다. [boto3 start_query_execution](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/athena.html#Athena.Client.start_query_execution) |
| ThrottlingErrorCount | `athena-query-executor` Lambda에서 쓰로틀링 에러(TooManyRequestsException)가 발생한 횟수입니다.   |
| RestartQueryCount    | `athena-query` SQS에서 `athena-query-deadletter` SQS로 대기열에 추가된 쿼리를 다시 시작한 횟수입니다.   |

# Creating the table for ALB logs

https://docs.aws.amazon.com/ko_kr/athena/latest/ug/application-load-balancer-logs.html

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alb_logs (
            type string,
            time string,
            elb string,
            client_ip string,
            client_port int,
            target_ip string,
            target_port int,
            request_processing_time double,
            target_processing_time double,
            response_processing_time double,
            elb_status_code int,
            target_status_code string,
            received_bytes bigint,
            sent_bytes bigint,
            request_verb string,
            request_url string,
            request_proto string,
            user_agent string,
            ssl_cipher string,
            ssl_protocol string,
            target_group_arn string,
            trace_id string,
            domain_name string,
            chosen_cert_arn string,
            matched_rule_priority string,
            request_creation_time string,
            actions_executed string,
            redirect_url string,
            lambda_error_reason string,
            target_port_list string,
            target_status_code_list string,
            classification string,
            classification_reason string
            )
            ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.RegexSerDe'
            WITH SERDEPROPERTIES (
            'serialization.format' = '1',
            'input.regex' = 
        '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) \"([^ ]*) (.*) (- |[^ ]*)\" \"([^\"]*)\" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^\"]*)\" ([-.0-9]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^ ]*)\" \"([^\s]+?)\" \"([^\s]+)\" \"([^ ]*)\" \"([^ ]*)\"')
            LOCATION 's3://your-alb-logs-directory/AWSLogs/<ACCOUNT-ID>/elasticloadbalancing/<REGION>/';

```

Update `LOCATION 's3://your-alb-logs-directory/AWSLogs/<ACCOUNT-ID>/elasticloadbalancing/<REGION>/';` for your bucket name and region.

## Testing

Update the API endpoint of athena-sqs-apigw-template.jmx.

```json
sed -e "s|<random-id>.execute-api.ap-northeast-2.amazonaws.com|yourEndpoint|g"  > athena-sqs-apigw.jmx
jmeter.sh -t athena-sqs-apigw.jmx
```

/dev/athena/query API payload:

```json
{
  "userId": "e586fd16-61bc-4f21-b2b9-1b8b69066510",
  "queryId": "79a9aac3-e82b-4ed9-9fd5-eda242a4ad72",
  "query": "SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM product_alb_logs GROUP BY request_verb, client_ip;"
}
```
