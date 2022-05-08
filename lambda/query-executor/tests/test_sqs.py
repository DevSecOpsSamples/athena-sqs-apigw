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

from test_query_executor import QueryExecutorTestCase

log_helper.init_log_config()


class SqsTestCase(unittest.TestCase):
    """

    """

    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.INFO)
        # logging.basicConfig(level=logging.DEBUG)

    def test_delete_message(self):
        """
        An error occurred (InvalidParameterValue) when calling the DeleteMessage operation
        """
        with EnvironmentVarGuard() as env:
            with self.assertRaises(ClientError) as e:
                env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
                response = Sqs().delete_message('AQEBhi1qiQLUwHNgjTwyq7ZhyyQgVBi9I1OToyeUybHtWj3d73qNuoOIP3BOBGO836GMxn8jW6ZKqo+QJ36Hakto5HqvNPgvVk0sE1OaVeuRT5KLRDFSs0e257VvrN9oHLOOT33kGXSNYgoLkgt0HJ5FG0yKRhM5XTeVIIpQWcCKv6bk5NMUEj+piaB0h+srA+FL5AuXsaDAX53foi4tffZ7UTaKsxTN4i5EeRvcaXn+jcqeGGp8on+y1PZEsOMFoylbr08a+IE3eMPg7GNtUAR86/IvbCcjNOgQhhOE8rPX06J/WCxUTnl/wLQfwAzpREHtdnswkee1saDpiUvvR8hBviBvTia/DVGM9+fPzIkCwGtVX1TIkmz7tE/fAdDgEIk6U1oiP7VUEXCkZV+0MaNwfw==')

    def test_receive_deadletter_message(self):
        with EnvironmentVarGuard() as env:
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            sqs = Sqs()
            response = sqs.send_deadletter_message(QueryExecutorTestCase()._get_json_query_string())
            logging.info('response : %s' % response)
            messages = sqs.receive_deadletter_message()

            logging.info('messages : %s' % messages)

            self.assertTrue('ResponseMetadata' in messages)
            if 'Messages' in messages:
                for record in messages['Messages']:
                    self.assertTrue('MessageId' in record)
                    logging.info('Message : %s' % record)
                
    def test_empty_deadletter_message(self):
        with EnvironmentVarGuard() as env:
            env['SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-dev'
            env['DEADLETTER_SQS_URL'] = 'https://sqs.ap-northeast-2.amazonaws.com/681747700094/athena-query-deadletter-dev'

            sqs = Sqs()
            messages = sqs.receive_deadletter_message()

            logging.info('messages : %s' % messages)

            self.assertTrue('ResponseMetadata' in messages)
            if 'Messages' in messages:
                for record in messages['Messages']:
                    self.assertTrue('MessageId' in record)
                    logging.info('Message : %s' % record)