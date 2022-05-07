import os
import boto3
import logging

from botocore.exceptions import ClientError


class Sqs(object):
    """

    """

    def delete_message(self, receipt_handle):
        """

        """
        sqs_url = os.environ['SQS_URL']
        sqs_client = boto3.client('sqs')
        return sqs_client.delete_message(QueueUrl=sqs_url, ReceiptHandle=receipt_handle)

    def send_deadletter_message(self, message):
        """

        """
        sqs_url = os.environ['DEADLETTER_SQS_URL']
        sqs_client = boto3.client('sqs')
        return sqs_client.send_message(QueueUrl=sqs_url, MessageBody=message, DelaySeconds=60)
