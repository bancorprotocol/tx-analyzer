const Web3 = require('web3');
const InputDataDecoder = require('ethereum-input-data-decoder');
const fs = require('fs');
const prompts = require('prompts');


const abis = {
    converter: JSON.parse( fs.readFileSync('./abis/BancorConverter.abi', 'utf8') ),
    oldConverter: JSON.parse( fs.readFileSync('./abis/BancorConverterOld.abi', 'utf8') ),
    erc20: JSON.parse( fs.readFileSync('./abis/ERC20Token.abi', 'utf8') ),
    smartToken: JSON.parse( fs.readFileSync('./abis/SmartToken.abi', 'utf8') ),
    gasPriceLimit: JSON.parse( fs.readFileSync('./abis/GasPriceLimit.abi', 'utf8') ),
    bancorNetwork: JSON.parse( fs.readFileSync('./abis/BancorNetwork.abi', 'utf8') )
};

const BANCOR_NETWORK = '0x0e936b11c2e7b601055e58c7e32417187af4de4a';

let web3;
const converterDecoder = new InputDataDecoder(abis.converter);
const oldConverterDecoder = new InputDataDecoder(abis.oldConverter);
const bancorNetworkDecoder = new InputDataDecoder(abis.bancorNetwork);

async function startPrompt() {
    const questions = [
        {
          type: 'text',
          name: 'web3Endpoint',
          message: 'Please enter a web3 endpoint'
        },
        {
          type: 'text',
          name: 'transactionHash',
          message: 'Please enter failed conversion transaction hash'
        }
      ];

    const { web3Endpoint, transactionHash } = await prompts(questions); 

    web3 = new Web3(web3Endpoint);
    return getConversionFailureReason(transactionHash);
}

async function getConversionFailureReason(transactionHash) {
    try {
        let res;
        const transaction = await web3.eth.getTransaction(transactionHash);
        const decodedData = getDecodedData(transaction.input);
        
        res = await checkAllowance(transaction, decodedData);
        if (!res.ok) return res.data;

        res = await checkMinimumReturn(transaction, decodedData);
        if (!res.ok) return res.data;

        return { info: 'Can\'t figure out why the transaction failed...' };
    }
    catch({message}) {
        return message;
    }
    
}

function getDecodedData(txInput) {
    for (const decoder of [converterDecoder, oldConverterDecoder, bancorNetworkDecoder]) {
        const decodedData = decoder.decodeData(txInput);
        if (['quickConvert', 'quickConvertPrioritized', 'convert2', 'claimAndConvert2'].includes(decodedData.method))
            return decodedData;
    }
    throw new Error('only conversion transactions can be decoded');
}


async function checkMinimumReturn({ blockNumber }, decodedData) {
    const conversionPath = decodedData.inputs[0].map(address => address.startsWith('0x') ? address : `0x${address}`);
    const inputAmount = decodedData.inputs[1].toString();
    const minimumReturn = decodedData.inputs[2].toString();
    
    const returnedAmount = await calculateReturnAmount(conversionPath, inputAmount, blockNumber);
    const preBlockReturnedAmount = await calculateReturnAmount(conversionPath, inputAmount, blockNumber - 1);

    if (returnedAmount < minimumReturn || preBlockReturnedAmount < minimumReturn) {
        const data = { 
            failureReason: 'Minimum Return',
            info: `Transaction was sent with a minimum return of ${minimumReturn}, but actual returned amount was ${returnedAmount < minimumReturn ? returnedAmount : preBlockReturnedAmount}`
         };
        return {
            ok: false,
            data
        };
    }

    return { ok: true };
}


async function checkAllowance({ blockNumber, from }, decodedData) {
    const fromToken = new web3.eth.Contract(abis.erc20, `0x${decodedData.inputs[0][0]}`);
    const inputAmount = decodedData.inputs[1].toString();
    
    const allowance = await fromToken.methods.allowance(from, BANCOR_NETWORK).call({}, blockNumber);
    
    if (allowance.lt(inputAmount)) {
        const data = { 
            failureReason: 'Insufficent allowance',
            info: `The Bancor Network must be approved to spend at least ${inputAmount}, but the current allowance is ${allowance.toString()}`
         };
        return {
            ok: false,
            data
        };
    }

    return { ok: true };
}


// utils

async function calculateReturnAmount(conversionPath, inputAmount, blockNumber) {
    inputAmount = String(inputAmount);
    for (let i = 1; i < conversionPath.length; i += 2) {
        const smartToken = new web3.eth.Contract(abis.smartToken, conversionPath[i]);
        const converterAddress = await smartToken.methods.owner.call({}, blockNumber);
        const converter = new web3.eth.Contract(abis.converter, converterAddress);
        inputAmount = String(await converter.methods.getReturn(conversionPath[i-1], conversionPath[i+1], inputAmount).call({}, blockNumber)) 
    }

    return inputAmount;
}


startPrompt().then(console.log).catch(console.error);
