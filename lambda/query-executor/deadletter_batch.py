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
    Handle dead letter SQS messages through EventBridge every minute.
    1. Send a message to query queue
    2. Delete a message from dead letter query queue
    3. Put the RestartQuery metric
    """

    print('event:' + str(event))
    count = 0

    try:
        sqs = Sqs()
        athena = Athena()
        messages = sqs.receive_deadletter_message()
        logging.info('messages : %s' % messages)

        while 'Messages' in messages:
            if count > 1000:
                return
            for record in messages['Messages']:
                count = count + 1
                json_query = record['Body']
                print('message num:' + str(count) + ', json_query: ' + json_query)
                
                sqs.send_message(json_query)

                receipt_handle = record['ReceiptHandle']
                print('Delete receipt_handle:' + receipt_handle)
                sqs.delete_deadletter_message(receipt_handle)

            messages = sqs.receive_deadletter_message()
        else:
            print('message is empty!')
        return {
                "statusCode": 200,
                "body": {
                    "code ": 'OK',
                    "message ": 'SUCCESS'
                }
            }
    except ClientError as e:
        logging.error(e)
        print('ERROR: ' + str(e))
        return {
                "statusCode": 500,
                "body": {
                    "code ": 'ERROR',
                    "message ": str(e)
                }
            }
    finally:
        athena.put_restart_metric('default', count)


# if __name__ == "__main__":
#     handler(None, None)