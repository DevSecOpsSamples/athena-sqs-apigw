import json
import time
import os
import boto3
import logging
from os import path

import app.athena
from app.sqs import Sqs
import log_helper

from botocore.exceptions import ClientError
# from botocore.errorfactory import TooManyRequestsException


class QueryResponse:

    def __str__(self):
        return "is_success:" + str(self.is_success) + ", is_throttle_error:" + str(self.is_throttle_error) \
               + ", query_execution_id:" + str(self.query_execution_id) + ", error:" + str(self.error)

    def __init__(self):
        self.is_success = False
        self.response = None
        self.error = None
        self.is_throttle_error = False
        self.query_execution_id = None


class Athena(object):
    """
    Athena query helper
    """

    def __init__(self):
        self.use_deadletter_queue = True
        self.sqs = Sqs()
        self.cw_client = boto3.client('cloudwatch')
        self.athena_client = boto3.client('athena')


    def start_query(self, query):
        """ batch size of event source is 1 """
        output = os.environ['OUTPUT_S3_BUCKET']
        DATABASE = 'default'

        query_response = app.athena.QueryResponse()

        try:
            self._put_success_metric(DATABASE)

            response = self.athena_client.start_query_execution(
                QueryString=query,
                QueryExecutionContext={
                    'Database': DATABASE
                },
                ResultConfiguration={
                    'OutputLocation': output,
                }
            )
            print('query:' + query)
            query_response.is_success = True
            query_response.response = response
            query_response.query_execution_id = response['QueryExecutionId']
            return query_response

        except BaseException as e:
            print('type: '+ str(type(e)))
            print(e)
            query_response.error = e
            if e.response['Error']['Code'] == 'TooManyRequestsException':
                query_response.is_throttle_error = True
            if self.use_deadletter_queue:
                print('========= SEND deadletter_message: %s', query)
                self.sqs.send_deadletter_message(query)
                self._put_fail_metric(DATABASE)
            pass
            return query_response

    def _put_success_metric(self, database):
        self.cw_client.put_metric_data(
            Namespace='AthenaQuery',
            MetricData=[
                {
                    'MetricName': 'StartQueryExecution',
                    'Dimensions': [
                        {
                            'Name': 'DATABASE',
                            'Value': database
                        },
                    ],
                    'Value': 1,
                    'Unit': 'Count'
                }
            ]
        )

    def _put_fail_metric(self, database):
        self.cw_client.put_metric_data(
            Namespace='AthenaQuery',
            MetricData=[
                {
                    'MetricName': 'ThrottlingError',
                    'Dimensions': [
                        {
                            'Name': 'DATABASE',
                            'Value': database
                        },
                    ],
                    'Value': 1,
                    'Unit': 'Count'
                }
            ]
        )
