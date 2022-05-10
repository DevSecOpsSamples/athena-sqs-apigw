import json
import os
import boto3
import logging

import app.athena
from app.sqs import Sqs

from botocore.exceptions import ClientError


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

    def start_query(self, json_query):
        """
        Send the JSON string message to dead letter SQS when throttling error occurs
        
        :param json json_query: e.g., {"userId": "e586fd16-61bc-4f21-b2b9-1b8b69066510", "queryId": "79a9aac3-e82b-4ed9-9fd5-eda242a4ad72", "query": "SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM product_alb_logs GROUP BY request_verb, client_ip"}
        """
        query = None
        assert 'query' in json_query
        query = json_query['query']
        print('query:' + query)
        
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
                print('=== SEND deadletter message: ', json_query)
                self.sqs.send_deadletter_message(json.dumps(json_query))
                self._put_fail_metric(DATABASE)
            pass
            return query_response

    def _put_success_metric(self, database):
        """
        :param string database: 
        """
        self.cw_client.put_metric_data(
            Namespace='AthenaQuery',
            MetricData=[
                {
                    'MetricName': 'StartQueryCount',
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
                    'MetricName': 'ThrottlingErrorCount',
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

    def put_restart_metric(self, database, value):
        print('Put Namespace:AthenaQuery, MetricName:RestartQuery Value: '+ str(value))
        self.cw_client.put_metric_data(
            Namespace='AthenaQuery',
            MetricData=[
                {
                    'MetricName': 'RestartQueryCount',
                    'Dimensions': [
                        {
                            'Name': 'DATABASE',
                            'Value': database
                        },
                    ],
                    'Value': value,
                    'Unit': 'Count'
                }
            ]
        )
