import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
/**
 * Athena query concurrent test using API Gateway, SQS, Lambda
 *
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_sqs-readme.html
 *
 */
export declare class ApigwAthenaSqsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps);
}
