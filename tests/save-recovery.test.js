import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptIntent,savedReceipt} from '../src/save-recovery.js';

test('受取の応答喪失後、同じ操作IDと金額・請求先を照合して重複再試行を避ける',()=>{
 const before={collectionEntries:[]};
 const receipt={id:'entry-1',requestId:'claim-1',roundId:'oct',buyerId:'buyer',itemId:'prior',received:2720};
 const intent=receiptIntent(before,{collectionEntries:[receipt]});
 assert.deepEqual(intent,receipt);
 assert.equal(savedReceipt({collectionEntries:[receipt]},intent),true);
 assert.equal(savedReceipt({collectionEntries:[{...receipt,id:'server-generated-entry'}]},intent),true);
 assert.equal(savedReceipt({collectionEntries:[{...receipt,received:2460}]},intent),false);
 assert.equal(savedReceipt({collectionEntries:[{...receipt,itemId:'current'}]},intent),false);
 assert.equal(savedReceipt({collectionEntries:[]},intent),false);
});
