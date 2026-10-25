import React from 'react';
import {useApp,Modal,Button} from './ui.jsx';
import {yen} from './domain.js';
import {roundProgress,closeRoundWithCarry} from './round-progress.js';

export function RoundClosePrompt({round,onClose,onResolve}){
  const {state,save}=useApp();
  const current=state.rounds.find(x=>x.id===round.id)||round;
  const progress=roundProgress(state,current);
  return <Modal title="今回分の集金を終了" onClose={onClose}>
    {progress.issues.length?<>
      <p>先に確認する内容があります。分かる項目から進められます。</p>
      {progress.issues.map((issue,i)=><div className="close-issue" key={i}>
        <span>{issue.message}</span><button type="button" className="text-action" onClick={()=>{onClose();onResolve?.(issue);}}>{issue.stage}で確認 ›</button>
      </div>)}
    </>:progress.status==='完了'?<p>今回分の集金業務は完了しています。</p>:<>
      <p><strong>今回分の未収：{progress.due.people.length}人 ／ {yen(progress.due.total)}</strong></p>
      <div className="close-people">{progress.due.people.map(x=><div key={x.buyerId}><span>{x.name}</span><strong>{yen(x.amount)}</strong></div>)}</div>
      <p className="muted">未収金と元の請求は残り、後の注文回から回収できます。今回の通常集金業務をここで終了します。</p>
      <Button onClick={async()=>{if(await save(s=>closeRoundWithCarry(s,round.id),'未収を残して今回分の集金を終了'))onClose();}}>未収を残して今回分を終了</Button>
    </>}
  </Modal>;
}
