import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// import { PythonFunction } from 'aws-cdk-lib/aws-lambda';

import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

/**
 * Athena query concurrent test using API Gateway, SQS, Lambda
 * 
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sqs-readme.html
 * 
 */
export class ApigwAthenaSqsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const env = this.node.tryGetContext('env') || 'dev';

    const deadLetterQueue = new sqs.Queue(this, 'deadletterQueryQueue', {
      queueName: `athena-query-deadletter-${env}`,
      retentionPeriod: Duration.minutes(120),
    });

    const queryQueue = new sqs.Queue(this, 'queryQueue', {
      queueName: `athena-query-${env}`
    });

    // change with your account id
    const accountId = props?.env?.account || '681747700094-vg'
    const bucket = new s3.Bucket(this, 's3', {
      bucketName: `athena-${accountId}-${env}`
    });

    const xrayLayer = new lambda.LayerVersion(this, 'xrayLayer', {
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_9,
      ],
      code: lambda.Code.fromAsset('temp/lambda-layer-xray'),
      description: 'Layer for X-Ray',
    });

    const athenaQueryReceiverLambda = new lambda.Function(this, 'athenaQueryReceiverLambda', {
      functionName: `athena-query-receiver-${env}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [xrayLayer], 
      code: lambda.Code.fromAsset('lambda/query-receiver'),
      handler: 'query_receiver.handler',
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.TWO_WEEKS,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        'SQS_URL': queryQueue.queueUrl
      }
    });
    const receiverUrl = athenaQueryReceiverLambda.addFunctionUrl();

    const athenaQueryExecutorLambda = new lambda.Function(this, 'athenaQueryExecutorLambda', {
      functionName: `athena-query-executor-${env}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [xrayLayer],
      code: lambda.Code.fromAsset('lambda/query-executor', { exclude: ['venv'] }),
      handler: 'query_executor.handler',
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.TWO_WEEKS,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        'SQS_URL': queryQueue.queueUrl,
        'DEADLETTER_SQS_URL': deadLetterQueue.queueUrl,
        'OUTPUT_S3_BUCKET': `s3://${bucket.bucketName}`,
      }
    });
    athenaQueryExecutorLambda.addEventSource(
      new SqsEventSource(queryQueue, {
        batchSize: 10,
      })
    );
    const executorUrl = athenaQueryExecutorLambda.addFunctionUrl();

    const athenaDeadletterQueryExecutorLambda = new lambda.Function(this, 'athenaDeadletterQueryExecutorLambda', {
      functionName: `athena-deadletter-query-executor-${env}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [xrayLayer],
      code: lambda.Code.fromAsset('lambda/query-executor', { exclude: ['venv'] }),
      handler: 'deadletter_batch.handler',
      timeout: Duration.minutes(15),
      logRetention: logs.RetentionDays.TWO_WEEKS,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        'SQS_URL': queryQueue.queueUrl,
        'DEADLETTER_SQS_URL': deadLetterQueue.queueUrl,
      }
    });
    const deadletterQueryExecutorUrl = athenaDeadletterQueryExecutorLambda.addFunctionUrl();
    const rule = new events.Rule(this, 'Rule', {
      ruleName: `athena-deadletter-query-executor-${env}`,
      schedule: events.Schedule.expression('rate(1 minute)')
    });
    rule.addTarget(new targets.LambdaFunction(athenaDeadletterQueryExecutorLambda));

    const functions = [athenaQueryReceiverLambda, athenaQueryExecutorLambda, athenaDeadletterQueryExecutorLambda];
    functions?.forEach(n => {
      n.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'));
      n.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));
    });
    athenaQueryExecutorLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'));
    athenaQueryExecutorLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    const api = new apigateway.RestApi(this, 'athena-api', {
      restApiName: `athena-api-${env}`,
      deployOptions: {
        stageName: env,
      }
    });
    const groupa = api.root.addResource('athena');
    groupa.addResource('query').addMethod('POST', new apigateway.LambdaIntegration(athenaQueryReceiverLambda, { proxy: true }));

    new CfnOutput(this, 'apiGatewayUrl', { value: api.url });
    new CfnOutput(this, 'receiverUrl', { value: receiverUrl.url });
    new CfnOutput(this, 'executorUrl', { value: executorUrl.url });
    new CfnOutput(this, 'deadletterQueryExecutorUrl', { value: deadletterQueryExecutorUrl.url });
    new CfnOutput(this, 'sqsUrl', { value: queryQueue.queueUrl });
    new CfnOutput(this, 'deadletterQuerySqsUrl', { value: deadLetterQueue.queueUrl });
    new CfnOutput(this, 'bucketName', { value: bucket.bucketName });
  }
}
