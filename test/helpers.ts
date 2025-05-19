import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

export async function createJoinChannelAndSignature(
  channelId: string,
  signer: SignerWithAddress,
  amount: number
) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  const joinChannel = {
    channelId,
    participant: signer.address,
    amount,
    deadlineTimestamp: currentTime + 3600, // 1 hour from now
    data: "0x"
  };
  
  const encodedJoinChannel = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(bytes32 channelId, address participant, uint256 amount, uint256 deadlineTimestamp, bytes data)"],
    [joinChannel]
  );
  
  const encodedHash = ethers.keccak256(encodedJoinChannel);
  const encodedHashBytes = ethers.getBytes(encodedHash);
  const signature = await signer.signMessage(encodedHashBytes);
  
  return { encodedJoinChannel, signature };
}
