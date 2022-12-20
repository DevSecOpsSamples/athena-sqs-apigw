"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApigwAthenaSqsStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const sqs = require("aws-cdk-lib/aws-sqs");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const logs = require("aws-cdk-lib/aws-logs");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
/**
 * Athena query concurrent test using API Gateway, SQS, Lambda
 *
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sqs-readme.html
 *
 */
class ApigwAthenaSqsStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c;
        super(scope, id, props);
        const env = this.node.tryGetContext('env') || 'dev';
        const deadLetterQueue = new sqs.Queue(this, 'deadletterQueryQueue', {
            queueName: `athena-query-deadletter-${env}`,
            retentionPeriod: aws_cdk_lib_1.Duration.minutes(120),
        });
        const queryQueue = new sqs.Queue(this, 'queryQueue', {
            queueName: `athena-query-${env}`
        });
        // change with your account id
        const accountId = ((_a = props === null || props === void 0 ? void 0 : props.env) === null || _a === void 0 ? void 0 : _a.account) || 'youraccountid';
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            logRetention: logs.RetentionDays.TWO_WEEKS,
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                'SQS_URL': queryQueue.queueUrl,
                'DEADLETTER_SQS_URL': deadLetterQueue.queueUrl,
                'OUTPUT_S3_BUCKET': `s3://${bucket.bucketName}`,
            }
        });
        athenaQueryExecutorLambda.addEventSource(new aws_lambda_event_sources_1.SqsEventSource(queryQueue, {
            batchSize: 10,
        }));
        const executorLambdaUrl = athenaQueryExecutorLambda.addFunctionUrl();
        const athenaDeadletterQueryExecutorLambda = new lambda.Function(this, 'athenaDeadletterQueryExecutorLambda', {
            functionName: `athena-deadletter-query-executor-${env}`,
            runtime: lambda.Runtime.PYTHON_3_9,
            layers: [xrayLayer],
            code: lambda.Code.fromAsset('lambda/query-executor', { exclude: ['venv'] }),
            handler: 'deadletter_batch.handler',
            timeout: aws_cdk_lib_1.Duration.minutes(15),
            logRetention: logs.RetentionDays.TWO_WEEKS,
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                'SQS_URL': queryQueue.queueUrl,
                'DEADLETTER_SQS_URL': deadLetterQueue.queueUrl,
            }
        });
        const deadletterLambdaUrl = athenaDeadletterQueryExecutorLambda.addFunctionUrl();
        const rule = new events.Rule(this, 'Rule', {
            ruleName: `athena-deadletter-query-executor-${env}`,
            schedule: events.Schedule.expression('rate(1 minute)')
        });
        rule.addTarget(new targets.LambdaFunction(athenaDeadletterQueryExecutorLambda));
        const functions = [athenaQueryReceiverLambda, athenaQueryExecutorLambda, athenaDeadletterQueryExecutorLambda];
        functions === null || functions === void 0 ? void 0 : functions.forEach(n => {
            var _a, _b;
            (_a = n.role) === null || _a === void 0 ? void 0 : _a.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'));
            (_b = n.role) === null || _b === void 0 ? void 0 : _b.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));
        });
        (_b = athenaQueryExecutorLambda.role) === null || _b === void 0 ? void 0 : _b.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'));
        (_c = athenaQueryExecutorLambda.role) === null || _c === void 0 ? void 0 : _c.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
        const api = new apigateway.RestApi(this, 'athena-api', {
            restApiName: `athena-api-${env}`,
            deployOptions: {
                stageName: env,
            }
        });
        const groupa = api.root.addResource('athena');
        groupa.addResource('query').addMethod('POST', new apigateway.LambdaIntegration(athenaQueryReceiverLambda, { proxy: true }));
        new aws_cdk_lib_1.CfnOutput(this, 'apiGatewayUrl', { value: api.url });
        new aws_cdk_lib_1.CfnOutput(this, 'receiverLambdaFunctionUrl', { value: receiverUrl.url });
        new aws_cdk_lib_1.CfnOutput(this, 'executorLambdaFunctionUrl', { value: executorLambdaUrl.url });
        new aws_cdk_lib_1.CfnOutput(this, 'deadletterLambdaUrl', { value: deadletterLambdaUrl.url });
        new aws_cdk_lib_1.CfnOutput(this, 'querySqsUrl', { value: queryQueue.queueUrl });
        new aws_cdk_lib_1.CfnOutput(this, 'deadletterQuerySqsUrl', { value: deadLetterQueue.queueUrl });
        new aws_cdk_lib_1.CfnOutput(this, 'bucketName', { value: bucket.bucketName });
    }
}
exports.ApigwAthenaSqsStack = ApigwAthenaSqsStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXRoZW5hLXNxcy1hcGlndy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF0aGVuYS1zcXMtYXBpZ3cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBQXFFO0FBR3JFLHlEQUF5RDtBQUN6RCxpREFBaUQ7QUFFakQsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyx5Q0FBeUM7QUFDekMsNkNBQTZDO0FBQzdDLGlEQUFpRDtBQUNqRCwwREFBMEQ7QUFDMUQsbUZBQXNFO0FBRXRFOzs7Ozs7R0FNRztBQUNILE1BQWEsbUJBQW9CLFNBQVEsbUJBQUs7SUFDNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQjs7UUFDMUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1FBRXBELE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDbEUsU0FBUyxFQUFFLDJCQUEyQixHQUFHLEVBQUU7WUFDM0MsZUFBZSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztTQUN2QyxDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNuRCxTQUFTLEVBQUUsZ0JBQWdCLEdBQUcsRUFBRTtTQUNqQyxDQUFDLENBQUM7UUFFSCw4QkFBOEI7UUFDOUIsTUFBTSxTQUFTLEdBQUcsQ0FBQSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE9BQU8sS0FBSSxlQUFlLENBQUE7UUFDeEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJ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SUFBSSxFQUFFLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNuRSxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFLEVBQUUsS0FBSyxFQUFFLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7Q0FDRjtBQWhIRCxrREFnSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRHVyYXRpb24sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcblxuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0IHsgU3FzRXZlbnRTb3VyY2UgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuXG4vKipcbiAqIEF0aGVuYSBxdWVyeSBjb25jdXJyZW50IHRlc3QgdXNpbmcgQVBJIEdhdGV3YXksIFNRUywgTGFtYmRhXG4gKiBcbiAqIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX2FwaWdhdGV3YXktcmVhZG1lLmh0bWxcbiAqIGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9jZGsvYXBpL3YyL2RvY3MvYXdzLWNkay1saWIuYXdzX3Nxcy1yZWFkbWUuaHRtbFxuICogXG4gKi9cbmV4cG9ydCBjbGFzcyBBcGlnd0F0aGVuYVNxc1N0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGVudiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcblxuICAgIGNvbnN0IGRlYWRMZXR0ZXJRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ2RlYWRsZXR0ZXJRdWVyeVF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgYXRoZW5hLXF1ZXJ5LWRlYWRsZXR0ZXItJHtlbnZ9YCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24ubWludXRlcygxMjApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcXVlcnlRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ3F1ZXJ5UXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBhdGhlbmEtcXVlcnktJHtlbnZ9YFxuICAgIH0pO1xuXG4gICAgLy8gY2hhbmdlIHdpdGggeW91ciBhY2NvdW50IGlkXG4gICAgY29uc3QgYWNjb3VudElkID0gcHJvcHM/LmVudj8uYWNjb3VudCB8fCAneW91cmFjY291bnRpZCdcbiAgICBjb25zdCBidWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdzMycsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhdGhlbmEtJHthY2NvdW50SWR9LSR7ZW52fWBcbiAgICB9KTtcblxuICAgIGNvbnN0IHhyYXlMYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsICd4cmF5TGF5ZXInLCB7XG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtcbiAgICAgICAgbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3RlbXAvbGFtYmRhLWxheWVyLXhyYXknKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGF5ZXIgZm9yIFgtUmF5JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGF0aGVuYVF1ZXJ5UmVjZWl2ZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdhdGhlbmFRdWVyeVJlY2VpdmVyTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXRoZW5hLXF1ZXJ5LXJlY2VpdmVyLSR7ZW52fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgbGF5ZXJzOiBbeHJheUxheWVyXSwgXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9xdWVyeS1yZWNlaXZlcicpLFxuICAgICAgaGFuZGxlcjogJ3F1ZXJ5X3JlY2VpdmVyLmhhbmRsZXInLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5UV09fV0VFS1MsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnU1FTX1VSTCc6IHF1ZXJ5UXVldWUucXVldWVVcmxcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCByZWNlaXZlclVybCA9IGF0aGVuYVF1ZXJ5UmVjZWl2ZXJMYW1iZGEuYWRkRnVuY3Rpb25VcmwoKTtcblxuICAgIGNvbnN0IGF0aGVuYVF1ZXJ5RXhlY3V0b3JMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdhdGhlbmFRdWVyeUV4ZWN1dG9yTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXRoZW5hLXF1ZXJ5LWV4ZWN1dG9yLSR7ZW52fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgbGF5ZXJzOiBbeHJheUxheWVyXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL3F1ZXJ5LWV4ZWN1dG9yJywgeyBleGNsdWRlOiBbJ3ZlbnYnXSB9KSxcbiAgICAgIGhhbmRsZXI6ICdxdWVyeV9leGVjdXRvci5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuVFdPX1dFRUtTLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgJ1NRU19VUkwnOiBxdWVyeVF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAnREVBRExFVFRFUl9TUVNfVVJMJzogZGVhZExldHRlclF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAnT1VUUFVUX1MzX0JVQ0tFVCc6IGBzMzovLyR7YnVja2V0LmJ1Y2tldE5hbWV9YCxcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhdGhlbmFRdWVyeUV4ZWN1dG9yTGFtYmRhLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IFNxc0V2ZW50U291cmNlKHF1ZXJ5UXVldWUsIHtcbiAgICAgICAgYmF0Y2hTaXplOiAxMCxcbiAgICAgIH0pXG4gICAgKTtcbiAgICBjb25zdCBleGVjdXRvckxhbWJkYVVybCA9IGF0aGVuYVF1ZXJ5RXhlY3V0b3JMYW1iZGEuYWRkRnVuY3Rpb25VcmwoKTtcblxuICAgIGNvbnN0IGF0aGVuYURlYWRsZXR0ZXJRdWVyeUV4ZWN1dG9yTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnYXRoZW5hRGVhZGxldHRlclF1ZXJ5RXhlY3V0b3JMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdGhlbmEtZGVhZGxldHRlci1xdWVyeS1leGVjdXRvci0ke2Vudn1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGxheWVyczogW3hyYXlMYXllcl0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9xdWVyeS1leGVjdXRvcicsIHsgZXhjbHVkZTogWyd2ZW52J10gfSksXG4gICAgICBoYW5kbGVyOiAnZGVhZGxldHRlcl9iYXRjaC5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuVFdPX1dFRUtTLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgJ1NRU19VUkwnOiBxdWVyeVF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAnREVBRExFVFRFUl9TUVNfVVJMJzogZGVhZExldHRlclF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGRlYWRsZXR0ZXJMYW1iZGFVcmwgPSBhdGhlbmFEZWFkbGV0dGVyUXVlcnlFeGVjdXRvckxhbWJkYS5hZGRGdW5jdGlvblVybCgpO1xuICAgIGNvbnN0IHJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ1J1bGUnLCB7XG4gICAgICBydWxlTmFtZTogYGF0aGVuYS1kZWFkbGV0dGVyLXF1ZXJ5LWV4ZWN1dG9yLSR7ZW52fWAsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmV4cHJlc3Npb24oJ3JhdGUoMSBtaW51dGUpJylcbiAgICB9KTtcbiAgICBydWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihhdGhlbmFEZWFkbGV0dGVyUXVlcnlFeGVjdXRvckxhbWJkYSkpO1xuXG4gICAgY29uc3QgZnVuY3Rpb25zID0gW2F0aGVuYVF1ZXJ5UmVjZWl2ZXJMYW1iZGEsIGF0aGVuYVF1ZXJ5RXhlY3V0b3JMYW1iZGEsIGF0aGVuYURlYWRsZXR0ZXJRdWVyeUV4ZWN1dG9yTGFtYmRhXTtcbiAgICBmdW5jdGlvbnM/LmZvckVhY2gobiA9PiB7XG4gICAgICBuLnJvbGU/LmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TUVNGdWxsQWNjZXNzJykpO1xuICAgICAgbi5yb2xlPy5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQ2xvdWRXYXRjaEZ1bGxBY2Nlc3MnKSk7XG4gICAgfSk7XG4gICAgYXRoZW5hUXVlcnlFeGVjdXRvckxhbWJkYS5yb2xlPy5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uQXRoZW5hRnVsbEFjY2VzcycpKTtcbiAgICBhdGhlbmFRdWVyeUV4ZWN1dG9yTGFtYmRhLnJvbGU/LmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TM0Z1bGxBY2Nlc3MnKSk7XG5cbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdhdGhlbmEtYXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBhdGhlbmEtYXBpLSR7ZW52fWAsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogZW52LFxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGdyb3VwYSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhdGhlbmEnKTtcbiAgICBncm91cGEuYWRkUmVzb3VyY2UoJ3F1ZXJ5JykuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXRoZW5hUXVlcnlSZWNlaXZlckxhbWJkYSwgeyBwcm94eTogdHJ1ZSB9KSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdhcGlHYXRld2F5VXJsJywgeyB2YWx1ZTogYXBpLnVybCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdyZWNlaXZlckxhbWJkYUZ1bmN0aW9uVXJsJywgeyB2YWx1ZTogcmVjZWl2ZXJVcmwudXJsIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ2V4ZWN1dG9yTGFtYmRhRnVuY3Rpb25VcmwnLCB7IHZhbHVlOiBleGVjdXRvckxhbWJkYVVybC51cmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnZGVhZGxldHRlckxhbWJkYVVybCcsIHsgdmFsdWU6IGRlYWRsZXR0ZXJMYW1iZGFVcmwudXJsIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ3F1ZXJ5U3FzVXJsJywgeyB2YWx1ZTogcXVlcnlRdWV1ZS5xdWV1ZVVybCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdkZWFkbGV0dGVyUXVlcnlTcXNVcmwnLCB7IHZhbHVlOiBkZWFkTGV0dGVyUXVldWUucXVldWVVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnYnVja2V0TmFtZScsIHsgdmFsdWU6IGJ1Y2tldC5idWNrZXROYW1lIH0pO1xuICB9XG59XG4iXX0=