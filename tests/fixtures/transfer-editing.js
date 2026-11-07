import {initialState,newRound,transfer} from '../../src/domain.js';
import {saveSnackSection} from '../../src/snack-billing.js';

export function transferEditingFixture(){
 const s=initialState(),r=newRound(s,'2026-10-16',true);r.status='納品済み';r.shortageConfirmation='none';s.rounds.push(r);
 const e={id:'editing-snack',roundId:r.id,name:'おやつ用',date:r.date,test:true,lines:[
  {id:'bean',productId:'bean',name:'こしあんぱん',qty:26,used:22,cost:130},
  {id:'apple',productId:'apple',name:'りんごデニッシュ（涼）',qty:19,used:16,cost:151},
  {id:'white',productId:'white',name:'天然酵母ハイジの白パン',qty:16,used:11,cost:95},
 ]};s.events.push(e);r.eventIds.push(e.id);
 // Purpose sections are saved later; old used remains an independent audit fact.
 for(const [i,qty] of [[0,4],[1,3],[2,5]]){transfer(s,e,e.lines[i],qty,190,r.date);s.stocks.at(-1).roundId=r.id;}
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 saveSnackSection(s,e.id,'direct',[{buyerId:'hori',lineId:'bean',qty:7,unitPrice:130},{buyerId:'asano',lineId:'white',qty:11,unitPrice:100}]);
 saveSnackSection(s,e.id,'common',{groups:[{id:'original-common',label:'共通単価',lineIds:['bean','apple'],quantities:{bean:11,apple:12},unitPrice:150,priceMode:'manual'},
  {id:'keep-empty',label:'空でも保全',lineIds:[],quantities:{},unitPrice:150}],household:[{buyerId:'hori',groupId:'original-common',lineId:null,qty:24,unitPrice:150}]});
 return {s,r,e,apple:s.stocks.find(st=>st.eventLineId==='apple'),white:s.stocks.find(st=>st.eventLineId==='white')};
}

