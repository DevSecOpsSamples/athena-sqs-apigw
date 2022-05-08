import os
import json
import boto3
import logging

from botocore.exceptions import ClientError


class Sqs(object):
    """
    https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sqs.html
    """

    def __init__(self):
        self.sqs_client = boto3.client('sqs')
        self.sqs_url = os.environ.get('SQS_URL', None)
        # self.deadletter_sqs_url = os.environ['DEADLETTER_SQS_URL']

    def delete_message(self, receipt_handle):
        """

        """
        return self.sqs_client.delete_message(QueueUrl=self.sqs_url, ReceiptHandle=receipt_handle)

    def send_message(self, json_query):
        """

        """
        if type(json_query) is dict:
            json_query = json.dumps(json_query)
        return self.sqs_client.send_message(QueueUrl=self.sqs_url, MessageBody=json_query, DelaySeconds=60)

    def send_deadletter_message(self, json_query):
        """

        """
        if type(json_query) is dict:
            json_query = json.dumps(json_query)
        deadletter_sqs_url = os.environ['DEADLETTER_SQS_URL']
        return self.sqs_client.send_message(QueueUrl=deadletter_sqs_url, MessageBody=json_query, DelaySeconds=60)

    def receive_deadletter_message(self):
        """

        """
        deadletter_sqs_url = os.environ['DEADLETTER_SQS_URL']
        return self.sqs_client.receive_message(QueueUrl=deadletter_sqs_url, MaxNumberOfMessages=10)

    def delete_deadletter_message(self, receipt_handle):
        """

        """
        deadletter_sqs_url = os.environ['DEADLETTER_SQS_URL']
        return self.sqs_client.delete_message(QueueUrl=deadletter_sqs_url, ReceiptHandle=receipt_handle)
