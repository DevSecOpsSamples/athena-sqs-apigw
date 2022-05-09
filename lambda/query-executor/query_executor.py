import json
import time
import logging
from os import path
import log_helper

from botocore.exceptions import ClientError

from app.athena import Athena
from app.sqs import Sqs

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all
patch_all()

log_helper.init_log_config()

def handler(event, context):
    """ 
    Lambda is triggered by 'athena-query-dev' queue. batch size of event source is 1 
    """

    print('event:' + str(event))

    athena = Athena()
    sqs = Sqs()

    for record in event['Records']:
        print('body: ' + str(record))
        jsonQuery = json.loads(record['body'])
        print('postApiBody: ' + str(jsonQuery))

        # query = postApiBody['query']
        receiptHandle = record['receiptHandle']

        try:
            athena.start_query(jsonQuery)
            sqs.delete_message(receiptHandle)
            return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "code ": 'OK',
                        "message ": 'SUCCESS'
                    })
                }
        except ClientError as e:
            logging.error(e)
            print(e)
            return {
                    "statusCode": 500,
                    "body": json.dumps({
                        "code ": 'ERROR',
                        "message ": e
                    })
                }
