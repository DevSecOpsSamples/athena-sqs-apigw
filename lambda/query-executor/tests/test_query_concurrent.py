#!/usr/bin/python
"""
usage:
python -m unittest discover -s ./tests -t ./tests -p test_query_concurrent.py
"""
import logging
import pprint
import unittest

from botocore.exceptions import ClientError
from test.support import EnvironmentVarGuard

from app.athena import Athena

import log_helper

# log_helper.init_log_config()


class QueryExecutorConcurrentTestCase(unittest.TestCase):
    """

    """

    # athena = None

    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.DEBUG)
        log_helper.init_log_config()
        # self.athena = Athena()

    def test_start_query_with_deadletter_queue(self):
        """ An error occurred (TooManyRequestsException) when calling the StartQueryExecution operation: You have exceeded the limit for the number of queries you can run concurrently. Please reduce the number of concurrent queries submitted by this account. Contact customer support to request a concurrent query limit increase. """

        with EnvironmentVarGuard() as env:
            env['OUTPUT_S3_BUCKET'] = 's3://app-undefined-dev'
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            athena = Athena()

            response = athena.start_query(
                'SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM alb_logs2 GROUP BY request_verb, client_ip LIMIT 100')

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

            response = athena.start_query(
                'SELECT COUNT(request_verb) AS count, request_verb, client_ip FROM alb_logs2 GROUP BY request_verb, client_ip LIMIT 100')

            self.assertTrue(response.is_success)
            self.assertIsNotNone(response.query_execution_id)
            logging.info('response : %s' % pprint.pformat(response.response))