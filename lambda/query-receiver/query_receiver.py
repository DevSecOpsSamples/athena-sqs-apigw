import json
import os
import boto3
import logging

from botocore.exceptions import ClientError

#
# https://github.com/awsdocs/aws-lambda-developer-guide/blob/main/sample-apps/blank-python/function/lambda_function.py
#
def handler(event, context):

    # TODO
    #  check duplicate query job id from DynamoDb
    # 
    try:
        body = event['body']
        sqsUrl = os.environ['SQS_URL']
        logging.info('sqsUrl{}, send_message:{}'.format(sqsUrl, body))

        sqs_client = boto3.client('sqs')
        res = sqs_client.send_message(QueueUrl=sqsUrl, MessageBody=body)

        return {
                "statusCode": 200,
                "body": json.dumps({
                    "msg ": 'OK',
                    "requestBody": body,
                    "sqsResponse ": res
                })
            }
    except ClientError as e:
        logging.error(e)
        return {
                "statusCode": 500,
                "body": json.dumps({
                    "msg ": 'ERROR',
                    "requestBody": body,
                    "sqsResponse ": e
                })
            }
