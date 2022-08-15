import json
import logging
import log_helper

from botocore.exceptions import ClientError

from app.athena import Athena
from app.sqs import Sqs

from aws_xray_sdk.core import patch_all
patch_all()

log_helper.init_log_config()

def handler(event, context):
    """ 
    Lambda is triggered by 'athena-query-dev' queue.
    """

    print('event:' + str(event))

    athena = Athena()
    sqs = Sqs()

    for record in event['Records']:
        print('body: ' + str(record))
        json_query = json.loads(record['body'])
        print('postApiBody: ' + str(json_query))

        # query = postApiBody['query']
        receipt_handle = record['receiptHandle']

        try:
            athena.start_query(json_query)
            sqs.delete_message(receipt_handle)
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
