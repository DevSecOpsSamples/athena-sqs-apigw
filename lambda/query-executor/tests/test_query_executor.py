#!/usr/bin/python
"""
usage:
python -m unittest discover -s ./tests -t ./tests -p test_query_executor.py
"""
import json
import logging
import pprint
import unittest

from test.support import EnvironmentVarGuard

import log_helper
from app.athena import Athena
from app.sqs import Sqs

log_helper.init_log_config()
class QueryExecutorTestCase(unittest.TestCase):
    """

    """

    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.DEBUG)

    def test_start_query_with_deadletter_queue(self):
        """
        An error occurred (TooManyRequestsException) when calling the StartQueryExecution operation: You have exceeded the limit for the number of queries you can run concurrently. Please reduce the number of concurrent queries submitted by this account. Contact customer support to request a concurrent query limit increase.
        """

        with EnvironmentVarGuard() as env:
            env['OUTPUT_S3_BUCKET'] = 's3://app-undefined-dev'
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            athena = Athena()

            response = athena.start_query(self._get_json_query())

            if response.is_success:
                self.assertTrue(response.is_success)
                self.assertIsNotNone(response.query_execution_id)
                logging.info('response : %s' % pprint.pformat(response.response))
            else:
                self.assertFalse(response.is_success)
                self.assertIsNone(response.query_execution_id)
                self.assertTrue(response.is_throttle_error)
                logging.error('response : %s' % response)

    def test_start_query(self):
        with EnvironmentVarGuard() as env:
            env['OUTPUT_S3_BUCKET'] = 's3://app-undefined-dev'
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            athena = Athena()
            athena.use_deadletter_queue = False
            response = athena.start_query(self._get_json_query())

            self.assertTrue(response.is_success)
            self.assertIsNotNone(response.query_execution_id)
            logging.info('response : %s' % pprint.pformat(response.response))

    # def test_handler_without_envvars(self):
    #     with self.assertRaises(KeyError) as e:
    #         event = self._get_event()
    #         response = query_executor.handler(event, None)

    def _get_json_query(self):
        return {
            "userId": "e586fd16-61bc-4f21-b2b9-1b8b69066510",
            "queryId": "79a9aac3-e82b-4ed9-9fd5-eda242a4ad72",
            "query": "SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM product_alb_logs GROUP BY request_verb, client_ip;"
        }

    def _get_json_query_string(self):
        return json.dumps(self._get_json_query())

    def _get_event(self):
        return {
            "Records":[
                {
                "messageId":"ee9f97fe-f3cb-4022-8906-c0a2d21bbf6f",
                "receiptHandle":"AQEBhi1qiQLUwHNgjTwyq7ZhyyQgVBi9I1OToyeUybHtWj3d73qNuoOIP3BOBGO836GMxn8jW6ZKqo+QJ36Hakto5HqvNPgvVk0sE1OaVeuRT5KLRDFSs0e257VvrN9oHLOOT33kGXSNYgoLkgt0HJ5FG0yKRhM5XTeVIIpQWcCKv6bk5NMUEj+piaB0h+srA+FL5AuXsaDAX53foi4tffZ7UTaKsxTN4i5EeRvcaXn+jcqeGGp8on+y1PZEsOMFoylbr08a+IE3eMPg7GNtUAR86/IvbCcjNOgQhhOE8rPX06J/WCxUTnl/wLQfwAzpREHtdnswkee1saDpiUvvR8hBviBvTia/DVGM9+fPzIkCwGtVX1TIkmz7tE/fAdDgEIk6U1oiP7VUEXCkZV+0MaNwfw==",
                "body":"{\n \"userId\":\"\",\n \"queryId\":\"\",\n \"query\":\"SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM alb_logs2 GROUP BY request_verb, client_ip LIMIT 100\"\n} ",
                "attributes":{
                    "ApproximateReceiveCount":"1",
                    "SentTimestamp":"1651587815846",
                    "SenderId":"AROAZ5O2ULF7GWPSH2AJA:app-query-receiver-dev",
                    "ApproximateFirstReceiveTimestamp":"1651587815848"
                },
                "messageAttributes":{
                    
                },
                "md5OfBody":"4dcedda58ab60f89860af066bf1dde6d",
                "eventSource":"aws:sqs",
                "eventSourceARN":"arn:aws:sqs:ap-northeast-2:0123456789012:app-query-dev",
                "awsRegion":"ap-northeast-2"
                }
            ]
         }