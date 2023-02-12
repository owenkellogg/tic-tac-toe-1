import React, { useState, useEffect } from "react";
import Board from './Board';
import { TicTacToe } from "./contracts/tictactoe";
import { GameData, SquareData } from "./types";
import { Utils } from "./utils";
import { bsv, BuildMethodCallTxOptions, BuildMethodCallTxResult, buildPublicKeyHashScript, hash160, Sig, SignatureResponse, SmartContract, findSig } from 'scrypt-ts';


const calculateWinner = (squares: any) => {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const [a, b, c] = lines[i];
    if (squares[a] && squares[b] && squares[c] && squares[a].label === squares[b].label && squares[a].label === squares[c].label) {
      return { winner: squares[a], winnerRow: lines[i] };
    }
  }

  return { winner: null, winnerRow: null };
};



function Game(props: any) {

  const gameData = props.gameData as GameData;
  const setGameData = props.setGameData;

  const [lastTxId, setLastTxId] = useState<string>("")

  function canMove(i: number, squares: any) {
    if (!gameData.start) {
      alert("Pelease start the game!");
      return;
    }

    if (calculateWinner(squares).winner || squares[i]) {
      return false;
    }

    return true;
  }

  async function move(i: number, latestGameData: GameData) {
    const current = props.contract as TicTacToe;
    const nextInstance = current.next();
    // update nextInstance state
    Object.assign(nextInstance, Utils.toContractState(latestGameData));

    TicTacToe.bindTxBuilder('move', async (options: BuildMethodCallTxOptions<SmartContract>, n: bigint, sig: Sig) => {
    
      let play = current.is_alice_turn ? TicTacToe.ALICE : TicTacToe.BOB;


      const changeAddress = await current.signer.getDefaultAddress();

      const initBalance = current.from?.tx.outputs[current.from?.outputIndex].satoshis as number;

      const unsignedTx: bsv.Transaction = new bsv.Transaction()
        .addInputFromPrevTx(current.from?.tx as bsv.Transaction, current.from?.outputIndex)
        .from(options.utxos);

      if (nextInstance.won(play)) {

        unsignedTx.addOutput(new bsv.Transaction.Output({
          script: current.is_alice_turn ? buildPublicKeyHashScript(hash160(current.alice)) : buildPublicKeyHashScript(hash160(current.bob)),
          satoshis: initBalance
        }))
        .change(changeAddress)

        return Promise.resolve({
          unsignedTx,
          atInputIndex: 0,
          nexts: [

          ]
        }) as Promise<BuildMethodCallTxResult<TicTacToe>>

      } else if (nextInstance.full()) {

        const halfAmount = initBalance / 2

        unsignedTx.addOutput(new bsv.Transaction.Output({
          script: buildPublicKeyHashScript(hash160(current.alice)),
          satoshis: halfAmount
        }))
        .addOutput(new bsv.Transaction.Output({
          script: buildPublicKeyHashScript(hash160(current.bob)),
          satoshis: halfAmount
        }))
        .change(changeAddress)


        return Promise.resolve({
          unsignedTx,
          atInputIndex: 0,
          nexts: [

          ]
        }) as Promise<BuildMethodCallTxResult<TicTacToe>>
      } else {

        unsignedTx.addOutput(new bsv.Transaction.Output({
          script: nextInstance.lockingScript,
          satoshis: initBalance,
        }))
        .change(changeAddress)

        return Promise.resolve({
          unsignedTx,
          atInputIndex: 0,
          nexts: [
            {
              instance: nextInstance,
              atOutputIndex: 0,
              balance: initBalance
            }
          ]
        }) as Promise<BuildMethodCallTxResult<TicTacToe>>
      }
    });

    return current.methods.move(
      BigInt(i),
      (sigResponses: SignatureResponse[]) => {
        const pubKey = current.is_alice_turn ? current.alice : current.bob;
        return findSig(sigResponses, bsv.PublicKey.fromString(pubKey))
      }
    );
  }

  async function handleClick(i: number) {
    const history = gameData.history.slice(0, gameData.currentStepNumber + 1);
    const current = history[history.length - 1];
    const squares = current.squares.slice();


    if (!canMove(i, squares)) {
      console.error('can not move now!')
      return;
    }

    squares[i] = {
      label: gameData.isAliceTurn ? 'X' : 'O',
      n: history.length
    };

    let winner = calculateWinner(squares).winner;

    const gameData_ = {
      ...gameData,
      history: history.concat([
        {
          squares
        },
      ]),
      isAliceTurn: winner ? gameData.isAliceTurn : !gameData.isAliceTurn,
      currentStepNumber: history.length,
      start: true
    }

    const {tx, next} = await move(i, gameData_);

    props.setContract(next?.instance)

    const square = squares[i] as SquareData;
    if(square) {
      square.tx = tx.id;
    }

    console.log('move txid:', tx.id)
    // update states
    setGameData(gameData_)
    setLastTxId(tx.id)
  }






  const { history } = gameData;
  const current = history[gameData.currentStepNumber];
  const { winner, winnerRow } = calculateWinner(current.squares);


  let status;

  let icon;


  if (!gameData.isAliceTurn) {
    icon = <div className="bob" > Bob <img src="/tic-tac-toe/bob.png" alt="" /></div>
  } else {
    icon = <div className="alice" > Alice <img src="/tic-tac-toe/alice.jpg" alt="" /></div>
  }

  if (winner) {
    let winnerName = winner.label === 'X' ? 'Alice' : 'Bob';
    status = `Winner is ${winnerName}`;
  } else if (history.length === 10) {
    status = 'Draw. No one won.';
  } else {

    let nexter = gameData.isAliceTurn ? 'Alice' : 'Bob';

    status = `Next player: ${nexter}`;
  }

  return (
    <div className="game" >
      <div className="game-board" >

        <div className="game-title" >
          {icon}
          < div className="game-status" > {status} </div>
        </div>

        < Board
          squares={current.squares}
          winnerSquares={winnerRow}
          onClick={handleClick}
        />

        <div className="game-bottom" >
          {props.deployedTxId ? <div className="bet"><a href={Utils.getTxUri(props.deployedTxId)} target="_blank" rel="noreferrer" >Deploy transaction</a> </div> : undefined}
          {winner || history.length === 10 ? <div className="end"><a href={Utils.getTxUri(lastTxId)} target="_blank" rel="noreferrer" >Withdraw transaction</a> </div> : undefined }
        </div>
      </div>
    </div>);
}

export default Game;
