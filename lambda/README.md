# Athena CLI

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get default.region)

```

Install athena-cli:

```bash
# https://pypi.org/project/athena-cli/
pip install -r requirements.txt
```

```bash
athena
use default;
show tables;
```

```bash
athena:default> show tables;
 tab_name                                            
------------
 alb_logs
(1 rows)

Query dafa19c2-1eb3-4a94-9746-3a2a9cec8d19, SUCCEEDED
https://ap-northeast-2.console.aws.amazon.com/athena/home?force&region=ap-northeast-2#query/history/dafa19c2-1eb3-4a94-9746-3a2a9cec8d19
Time: 0:00:00, CPU Time: 328ms total, Data Scanned: 0.00B, Cost: $0.00
```

# Lambda Layer

```bash
mkdir -p ./layers/xray/python
pip install -r requirements.txt -t ./layers/xray/python
```
