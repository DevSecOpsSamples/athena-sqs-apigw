
# Athena concurrent query with API Gateway and SQS

## Background

There is a limitation of concurrent query according to the Quota:

| Region    | Quota name         | AWS default quota value | Adjustable |
|-----------|--------------------|--------------|--------------|
| us-east-1 | Active DDL queries | 20  |  Yes |
| us-east-1 | Active DML queries | 200 |  Yes |
| us-east-1 | DDL query timeout  | 600 |  Yes |
| us-east-1 | DML query timeout  | 30  |  Yes |

Throttling error message:

An error occurred (TooManyRequestsException) when calling the StartQueryExecution operation: You have exceeded the limit for the number of queries you can run concurrently. Please reduce the number of concurrent queries submitted by this account. Contact customer support to request a concurrent query limit increase.

This solution was made to retry Athena query when Throttling error occurred.

## Prerequisites

```bash
npm install -g aws-cdk@2.22.0

# install packages in the <repository-root>/cdk folder
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

| Service       | Name                        | Description  |
|---------------|-----------------------------|--------------|
| API Gateway   | /athena/query API           | RESTFul API to enqueue a Athena query. API endpoint: `https://<random-id>.execute-api.<region>.amazonaws.com/dev//athena/query`        |
| SQS           | athena-query-dev            | Athena query execution queue             |
| SQS           | athena-query-deadletter-dev | The dead letter queue of athena-query-dev SQS. Enqueue an Athena query when a throttling error occurs from athena-query-executor-dev Lambda.     |
| Lambda        | [athena-query-receiver-dev](./lambda/query-receiver/query_receiver.py)   | Receive an Athena query from API gateway and enqueue messages to `athena-query-dev` SQS.     |
| Lambda        | [athena-query-executor-dev](./lambda/query-executor/query_executor.py)   | Running Athena queries which received fromEvent Soruce(athena-query-dev Lambda).      |
| Lambda        | [athena-deadletter-query-executor-dev](./lambda/query-executor/deadletter_batch.py) | Batch Lambda to handle athena-query-deadletter-dev messages.        |
| EventBridge Rule | athena-deadletter-query-executor-dev     | Running the athena-deadletter-query-executor-dev Lambda every miniute. [EventBus Rule](https://ap-northeast-2.console.aws.amazon.com/events/home?region=ap-northeast-2#/eventbus/default/rules/)     |
| S3 Bucket     | athena-{account-id}-dev     | Athena query output bucket      |

### Flow

1. User > API Gateway(/athena/query API) > Lambda (athena-query-receiver-dev ) > SQS (athena-query-dev)
2. Query executor Lamda(athena-query-executor-dev) processing query messages from athena-query-dev SQS
3. Enqueue to athena-query-deadletter-dev about throttling error Athena quries
4. Batch Lambda processing Athena quries from dead letter SQS(athena-query-deadletter-dev) with 1 min interval

# CloudWatch Metric

## AWS Metric

Enable `Publish query metrics to AWS CloudWatch`
Workgroups > primary > Settings > Metrics > Publish query metrics to AWS CloudWatch

https://docs.aws.amazon.com/ko_kr/athena/latest/ug/query-metrics-viewing.html

| Metric          | Description        |
|-----------------|--------------------|
| QueryQueueTime      |  |
| QueryPlanningTime   |  |
| EngineExecutionTime |  |
| TotalExecutionTime  |  |
| ServiceProcessingTime  |  |
| ProcessedBytes      |  |

## Custom Metric

| Metric          | Description        |
|-----------------|--------------------|
| StartQuery      | start_query_execution function call count from athena-query-executor Lambda |
| ThrottlingError | Throttling error count(TooManyRequestsException)    |
| RestartQuery    | Resart query count by enque to athena-query-dev SQS |

# Setup Glue Schema
## Glue Schema

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

ALB log query:

```json
{
  "userId": "e586fd16-61bc-4f21-b2b9-1b8b69066510",
  "queryId": "79a9aac3-e82b-4ed9-9fd5-eda242a4ad72",
  "query": "SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM product_alb_logs GROUP BY request_verb, client_ip;"
}
```
