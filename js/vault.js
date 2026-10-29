'use strict';

// Only the latest write in the same unlocked account may update the vault.
let vaultWriteSeq = 0;
function cancelVaultWrites(){ vaultWriteSeq++; }

async function saveVault(){
  if(S.guest || !S.masterKey || !S.acc) return {ok:false};
  const seq = ++vaultWriteSeq, account = S.acc, key = S.masterKey;
  const stale = () => seq !== vaultWriteSeq || S.acc !== account || S.masterKey !== key;
  try{
    const box = await seal(key, {email:S.email, name:S.name, scans:S.scans});
    if(stale()) return {ok:false, cancelled:true};
    const previous = account.data;
    account.data = box;
    try{ if(accounts.put(account)) return {ok:true}; }catch(e){}
    account.data = previous;
    return {ok:false};
  }catch(e){ return stale() ? {ok:false, cancelled:true} : {ok:false}; }
}
