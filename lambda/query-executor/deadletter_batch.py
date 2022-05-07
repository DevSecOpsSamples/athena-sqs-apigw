import json
import time
import logging
from os import path
import log_helper

from botocore.exceptions import ClientError

from app.athena import Athena
from app.sqs import Sqs

log_helper.init_log_config()


def handler(event, context):
    """ 
    Lambda is triggered by 'athena-query-dev' queue. batch size of event source is 1 
    """

    print('event:' + str(event))

    for record in event['Records']:
        print('body:' + str(record))
        postApiBody = json.loads(record['body'])
        print('postApiBody:' + str(postApiBody))

        query = postApiBody['query']
        receiptHandle = record['receiptHandle']

        athena = Athena()
        sqs = Sqs()

        try:
            athena.start_query(query)
            sqs.delete_message(receiptHandle)
        except ClientError as e:
            logging.error(e)
            print(e)
            return {
                    "statusCode": 500,
                    "body": json.dumps({
                        "msg ": 'ERROR',
                        "message ": e
                    })
                }
