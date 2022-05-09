
# Retry Athena query with SQS and API Gateway

Athena 쿼리 동시 실행 Quota에 의해 쓰로틀링 에러가 발생할 수 있으며 SQS, dead letter SQS를 사용해 쓰틀링 에러 발생시 재실행 합니다.

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
| EventBridge Rule | athena-deadletter-query-executor     | 매분마다 athena-dead letter-query-execute Lambda를 실행합니다. [EventBus Rule](https://ap-northeast-2.console.aws.amazon.com/events/home?region=ap-northeast-2#/eventbus/default/rules/)     |
| S3 Bucket     | athena-{account-id}     | Athena query output bucket      |

### Flow

1. User > API Gateway(/athena/query API) > Lambda (athena-query-receiver) > SQS (athena-query)
2. Query executor Lamda(athena-query-executor)는 athena-query SQS에서 쿼리 메시지를 처리합니다.
3. athena-query-executor Lambda에서 throttling 오류가 발생할 때 Athena 쿼리를 대기열에 넣습니다.

   SQS (athena-query) > Lambda (athena-query-executor) > SQS (athena-query-deadletter)

4. dead leatter SQS(athena-query-deadletter)에서 Athena 쿼리를 일괄 처리하는 Lambda(athena-dead letter-query-executor) 를 EventBridge Rule을 통해 1분 간격으로 실행합니다.

# CloudWatch Metric

## AWS Metric

Enable `Publish query metrics to AWS CloudWatch` on Workgroups > primary > Settings > Metrics menu.

https://docs.aws.amazon.com/ko_kr/athena/latest/ug/query-metrics-viewing.html

| Metric                | Description        |
|-----------------------|--------------------|
| QueryQueueTime        | The number of milliseconds that the query was in the query queue waiting for resources.  |
| QueryPlanningTime     | The number of milliseconds that Athena took to plan the query processing flow.           |
| EngineExecutionTime   | The number of milliseconds that the query took to run. |
| TotalExecutionTime    | The number of milliseconds that Athena took to run a DDL or DML query. TotalExecutionTime includes QueryQueueTime, QueryPlanningTime, EngineExecutionTime, and ServiceProcessingTime. |
| ServiceProcessingTime | Number of milliseconds that Athena took to process the query results after the query engine finished running the query. |
| ProcessedBytes        | The number of bytes that Athena scanned per DML query. |

## Custom Metric

| Metric               | Description        |
|----------------------|--------------------|
| StartQueryCount      | `athena-query-executor` Lambda에서 start_query_execution 함수가 호출된 횟수입니다. |
| ThrottlingErrorCount | `athena-query-executor` Lambda에서 조절 오류(TooManyRequestsException)가 발생한 횟수입니다.   |
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
