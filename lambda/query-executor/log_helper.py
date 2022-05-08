import os
import logging
from os import path

global __log_initialized
__log_initialized = False


def is_initialized():
    global __log_initialized
    return __log_initialized


def set_initialized():
    global __log_initialized
    __log_initialized = True


def init_log_config():
    if is_initialized():
        return

    print('[INFO] Starting log configuration')
    logs_path = os.path.normpath(os.path.join(os.path.dirname(__file__), '/tmp/logs'))
    if not path.exists(logs_path):
        os.makedirs(logs_path)
    logging.basicConfig(
        filename=os.path.join(logs_path, 'athena-sqs.log'),
        level=logging.INFO,
        # level=logging.DEBUG,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    console = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
    console.setFormatter(formatter)
    logging.getLogger('').addHandler(console)
    set_initialized()
    print('[INFO] End log configuration')
