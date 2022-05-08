#!/usr/bin/python
"""
usage:
python -m unittest discover -s ./tests -t ./tests -p test_sqs.py
"""
import logging
import pprint
import unittest

from test.support import EnvironmentVarGuard
from botocore.exceptions import ClientError
# from botocore.exceptions import InvalidParameterValue

from app.sqs import Sqs
import log_helper
import deadletter_batch

from test_query_executor import QueryExecutorTestCase

log_helper.init_log_config()


class LambdaTestCase(unittest.TestCase):
    """

    """

    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.INFO)
        # logging.basicConfig(level=logging.DEBUG)

    def test_batch(self):
        with EnvironmentVarGuard() as env:
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            deadletter_batch.handler(None, None)
            