#!/usr/bin/python
"""
usage:
python -m unittest discover -s ./tests -t ./tests -p test_cloudwatch.py
"""
import logging
import pprint
import unittest

from botocore.exceptions import ClientError
from test.support import EnvironmentVarGuard

from app.athena import Athena

import log_helper

class CloudWatchMetricTestCase(unittest.TestCase):
    """
    CloudWatch Metric for query execution and throttling error 
    """

    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.DEBUG)
        log_helper.init_log_config()

    def test_start_query_with_deadletter_queue(self):
        
        with EnvironmentVarGuard() as env:
            env['OUTPUT_S3_BUCKET'] = 's3://app-undefined-dev'
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            athena = Athena()
            athena._put_success_metric('UNITTEST')
            athena._put_fail_metric('UNITTEST')
