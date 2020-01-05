# Tx Analyzer
### Analyze failed conversion transactions on Bancor

Given an failed conversion transaction hash (on Ethereum), this utility outputs the reason for why it failed.

_**Prerequisites**_
* An Infura project Id

_**Usage**_
```
npm start
```


_**Example Result**_
```json
{
  "ok": true,
  "data": {
      "failureReason": "Minimum Return",
      "info": "Transaction was sent with a minimum return of 426783474837234940, but actual returned amount was 423861513563611120"
  }
}
```
