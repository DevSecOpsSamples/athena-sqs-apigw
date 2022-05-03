import json
import os
import boto3
import logging

from botocore.exceptions import ClientError

def handler(event, context):
    _params = {'message': "hello"}

    # TODO
    #  check duplicate query job id from DynamoDb
    # 
    msg_body = json.dumps(_params)
    msg = send_sqs_message(os.environ['SQS_URL'], msg_body)
    return msg


def send_sqs_message(sqs_queue_url, msg_body):
    """
    :param sqs_queue_url: String URL of existing SQS queue
    :param msg_body: String message body
    :return: Dictionary containing information about the sent message. If
        error, returns None.
    """

    sqs_client = boto3.client('sqs')
    try:
        msg = sqs_client.send_message(QueueUrl=sqs_queue_url,
                                      MessageBody=msg_body)
    except ClientError as e:
        logging.error(e)
        return None
    return msg