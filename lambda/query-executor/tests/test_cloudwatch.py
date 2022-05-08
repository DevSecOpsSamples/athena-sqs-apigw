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

    def test_put_metric(self):
        """

        """

        athena = Athena()
        athena._put_success_metric('UNITTEST')
        athena._put_fail_metric('UNITTEST')
        athena.put_restart_metric('UNITTEST', 10)

