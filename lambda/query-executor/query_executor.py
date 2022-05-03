import json
import time
import os
import boto3
import logging
from os import path
import log_helper

from botocore.exceptions import ClientError

import query_executor as query_executor

log_helper.init_log_config()


def handler(event, context):
    """ batch size of event source is 1 """
    print('event:')
    print(event)

    for record in event['Records']:
        print('body:')
        print(record)
        postApiBody = json.loads(record['body'])
        print('postApiBody:')
        print(postApiBody)
        query = postApiBody['query']
        receiptHandle = record['receiptHandle']

        try:
            start_query(query)
            delete_message(receiptHandle)
        except ClientError as e:
            logging.error(e)
            print(e)
            return {
                    "statusCode": 500,
                    "body": json.dumps({
                        "msg ": 'ERROR',
                        "message ": e
                    })
                }

def delete_message(receiptHandle):
    sqs_url = os.environ['SQS_URL']
    sqs_client = boto3.client('sqs')
    return sqs_client.delete_message(QueueUrl=sqs_url, ReceiptHandle=receiptHandle)

def start_query(query):
    """ batch size of event source is 1 """
    output = os.environ['OUTPUT_S3_BUCKET']
    DATABASE = 'default'

    client = boto3.client('athena')
    response = client.start_query_execution(
        QueryString=query,
        QueryExecutionContext={
            'Database': DATABASE
        },
        ResultConfiguration={
            'OutputLocation': output,
        }
    )
    print('logging.info:')
    logging.info(response)
    print('response:')
    print(response)
    return response