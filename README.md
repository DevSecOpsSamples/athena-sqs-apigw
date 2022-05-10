### [English](./README.md) | [한국어](./README_ko.md)

# Retry Athena query with SQS and API Gateway

Athena query concurrent execution quota can cause throttling errors. An Athena query is stored in SQS through API Gateway and executed by Lambda, and when a throttling error occurs, it is stored in dead letter SQS and re-executed every 1 minute through EventBridge. Use SQS and dead letter SQS to ensure that all queries requested by users work in sequence without loss.

![architecture](./screenshots/architecture.png?raw=true)

![cloudwatch-metric](./screenshots/cloudwatch-metric.png?raw=true)

## Quota

Service Quotas https://docs.aws.amazon.com/ko_kr/athena/latest/ug/service-limits.html:

"A DML or DDL query quota includes both running and queued queries. For example, if your DML query quota is 25 and your total of running and queued queries is 26, query 26 will result in a TooManyRequestsException error."

| Region    | Quota name         | AWS default quota value | Adjustable |
|-----------|--------------------|--------------|--------------|
| us-east-1 | Active DDL queries | 20  |  Yes |
| us-east-1 | Active DML queries | **200** |  Yes |
| us-east-1 | DDL query timeout  | 600 |  Yes |
| us-east-1 | DML query timeout  | 30  |  Yes |
| ap-northeast-2 | Active DDL queries | 20  |  Yes |
| ap-northeast-2 | Active DML queries | **100** |  Yes |
| ap-northeast-2 | DDL query timeout  | 600 |  Yes |
| ap-northeast-2 | DML query timeout  | 30  |  Yes |

Throttling error message:

An error occurred (TooManyRequestsException) when calling the StartQueryExecution operation: You have exceeded the limit for the number of queries you can run concurrently. Please reduce the number of concurrent queries submitted by this account. Contact customer support to request a concurrent query limit increase.

## Structure

```text
├── athena-sqs-apigw-template.jmx
├── bin
│   └── index.ts
├── cdk.json
├── lambda
│   ├── README.md
│   ├── query-executor
│   │   ├── app
│   │   │   ├── athena.py
│   │   │   └── sqs.py
│   │   ├── deadletter_batch.py
│   │   ├── log_helper.py
│   │   └── query_executor.py
│   ├── query-receiver
│   │   └── query_receiver.py
│   └── requirements.txt
├── lib
│   └── athena-sqs-apigw.ts
└── tsconfig.json
```

## Prerequisites

* Python 3.9
* node 17.7.1, npm 8.5.2

```bash
npm install -g aws-cdk@2.23.0
npm install

export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-east-1

cdk bootstrap
```

Use the `cdk` command-line toolkit to interact with your project:

* `cdk deploy`: deploys your app into an AWS account
* `cdk synth`: synthesizes an AWS CloudFormation template for your app
* `cdk diff`: compares your app with the deployed stack
* `cdk watch`: deployment every time a file change is detected. You can Lambda CloudWatch Logs after development.

### CDK deploy

```bash
mkdir -p ./temp/lambda-layer-xray/python
pip install -r ./lambda/requirements.txt -t ./temp/lambda-layer-xray/python

cdk deploy
```

[lib/athena-sqs-apigw.ts](./lib/athena-sqs-apigw.ts)

### Resources

All resources use the {stage} suffix such as athena-query-local, athena-query-dev, and athena-query-stg.

| Service       | Name                        | Description  |
|---------------|-----------------------------|--------------|
| API Gateway   | /athena/query POST API      | RESTFul API to enqueue a Athena query. API endpoint: `https://<random-id>.execute-api.<region>.amazonaws.com/dev/athena/query`        |
| SQS           | athena-query                | Athena query execution queue             |
| SQS           | athena-query-deadletter     | The dead letter queue of athena-query SQS. Enqueue an Athena query when a throttling error occurs from athena-query-executor Lambda.     |
| Lambda        | [athena-query-receiver](./lambda/query-receiver/query_receiver.py)   | Receive an Athena query from API gateway and enqueue messages to `athena-query` SQS.     |
| Lambda        | [athena-query-executor](./lambda/query-executor/query_executor.py)   | Running Athena queries which received fromEvent Soruce(athena-query Lambda).      |
| Lambda        | [athena-deadletter-query-executor](./lambda/query-executor/deadletter_batch.py) | Batch Lambda to handle athena-query-deadletter messages.        |
| EventBridge Rule | athena-deadletter-query-executor     | Running the athena-deadletter-query-executor Lambda every miniute. [EventBus Rule](https://ap-northeast-2.console.aws.amazon.com/events/home?region=ap-northeast-2#/eventbus/default/rules/)     |
| S3 Bucket     | athena-{account-id}     | Athena query output bucket      |

* [lambda/query-executor/app/athena.py](./lambda/query-executor/app/athena.py)
* [lambda/query-executor/app/sqs.py](./lambda/query-executor/app/sqs.py)

### Flow

1. A user sends an Athena query in JSON format to API Gateway (/athena/query POST API), which sends a message to the athena-query queue via Lambda (athena-query-receiver).

2. The athena-query-executor Lambda that Event Source is SQS(athena-query) receives messages from the queue and executes the Athena queries.

   athena-query-executor Lambda receives up to 10 messages from the queue.

3. If the Athena query execution fails due to a throttling error, it enqueue messages to the deadletter queue.

   SQS(athena-query) → Lambda(athena-query-executor) → SQS(athena-query-deadletter)

4. To re-execute the failed queries, send messages from the dead letter queue to the athena-query queue.

   Lambda(athena-deadletter-query-executor) is invoked every 1-minute by EventBridge Rule.

   SQS(athena-query-deadletter) → Lambda(athena-deadletter-query-executor) → enqueue SQS(athena-query)

![xray](./screenshots/xray.png?raw=true)

## CloudWatch Metric

### AWS Metric

Enable `Publish query metrics to AWS CloudWatch` on Workgroups > primary > Settings > Metrics menu.

https://docs.aws.amazon.com/ko_kr/athena/latest/ug/query-metrics-viewing.html

| Metric                | Description        |
|-----------------------|--------------------|
| TotalExecutionTime    | The number of milliseconds that Athena took to run a DDL or DML query. TotalExecutionTime includes QueryQueueTime, QueryPlanningTime, EngineExecutionTime, and ServiceProcessingTime. |
| QueryQueueTime        | The number of milliseconds that the query was in the query queue waiting for resources.  |
| QueryPlanningTime     | The number of milliseconds that Athena took to plan the query processing flow.           |
| EngineExecutionTime   | The number of milliseconds that the query took to run. |
| ServiceProcessingTime | Number of milliseconds that Athena took to process the query results after the query engine finished running the query. |
| ProcessedBytes        | The number of bytes that Athena scanned per DML query. |

### Custom Metric

| Metric               | Description        |
|----------------------|--------------------|
| StartQueryCount      | The number of count that start_query_execution function is called from `athena-query-executor` Lambda. |
| ThrottlingErrorCount | The number of count that throttling error(TooManyRequestsException) occured from `athena-query-executor` Lambda.   |
| RestartQueryCount    | The number of count that restarted query being enqueud from `athena-query` SQS to `athena-query-deadletter` SQS.   |

## Testing

### Creating the table for ALB logs

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

### JMeter

Create a file that reflects the API endpoint of the athena-sqs-apigw-template.jmx JMeter file.

```bash
sed -e "s|<random-id>.execute-api.<region>.amazonaws.com|yourEndpoint|g" > athena-sqs-apigw.jmx
jmeter.sh -t athena-sqs-apigw.jmx
```

/dev/athena/query POST API payload:

```json
{
  "userId": "e586fd16-61bc-4f21-b2b9-1b8b69066510",
  "queryId": "79a9aac3-e82b-4ed9-9fd5-eda242a4ad72",
  "query": "SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM alb_logs GROUP BY request_verb, client_ip;"
}
```
