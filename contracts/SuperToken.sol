pragma solidity ^0.4.24;

import 'openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol';

contract SuperToken is MintableToken {
    string public name = 'Super Token';
    string public symbol = 'SUP';
    uint8 public decimals = 18;
}
