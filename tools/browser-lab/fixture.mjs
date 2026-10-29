// Evaluated in the isolated page before any application script. Never imports the real SDK.
export function installFixture(config){
 const fixtureUser={id:'synthetic-user',email:'fixture@example.invalid'};
 const job={id:42,company_id:9,status:'募集中',required_headcount:2,hired_count:0,applications:[],job_description:'架空の配送求人',location:'架空県 テスト市',work_date:'2099-11-01',start_time:'09:00:00',end_time:'17:00:00',pay_type:'時給',pay_amount:1500,pay_guarantee:true,break_minutes:60,companies:{company_name:'架空運送'}};
 const driver={id:7,user_id:fixtureUser.id,name:'テスト 太郎',name_kana:'テスト タロウ',preferred_area:'',is_paused:false};
 const company={id:9,user_id:fixtureUser.id,company_name:'架空運送',email:fixtureUser.email};
 const state={calls:[],holds:{},submitted:sessionStorage.getItem('fixtureSubmitted')==='yes',deleted:sessionStorage.getItem('fixtureDeleted')==='yes',violations:[]};window.__fixture=state;
 document.addEventListener('securitypolicyviolation',e=>state.violations.push({directive:e.violatedDirective,blocked:e.blockedURI}));
 function record(value){state.calls.push(value);window.__record(value)}
 async function hold(key){if(config.hold===key)await new Promise(resolve=>state.holds[key]=resolve)}
 state.release=key=>{if(!state.holds[key])throw Error('No pending fixture '+key);state.holds[key]();delete state.holds[key]};
 class Query{
  constructor(table){this.table=table;this.operation='read';this.filters=[];this.fields='*';this.singular=false}
  select(fields='*'){this.fields=fields;return this}
  eq(k,v){this.filters.push([k,v]);return this}
  in(){return this}order(){return this}range(){return this}gte(){return this}lte(){return this}neq(){return this}limit(){return this}
  maybeSingle(){this.singular=true;return this}single(){this.singular=true;return this}
  insert(row){this.operation='insert';this.row=row;return this}delete(){this.operation='delete';return this}update(row){this.operation='update';this.row=row;return this}
  then(resolve,reject){return this.run().then(resolve,reject)}
  async run(){
   const {table,operation}=this;record({table,operation,filters:this.filters,row:this.row});
   if(operation!=='read'){
    if(table!=='applications'||!['insert','delete'].includes(operation))throw Error('Unexpected mock mutation '+table+':'+operation);
    await hold(operation);
    if(config.mode==='transport'&&operation==='insert')throw Error('Synthetic response lost');
    if(config.mode==='duplicate'&&operation==='insert')return {data:null,error:{code:'23505',message:'unique violation'}};
    if(operation==='insert'){state.submitted=true;sessionStorage.setItem('fixtureSubmitted','yes');return {data:null,error:null}}
    if(config.mode==='zero_delete')return {data:[],error:null};
    state.deleted=true;sessionStorage.setItem('fixtureDeleted','yes');return {data:[{id:43}],error:null};
   }
   if(table==='drivers')return {data:this.singular?driver:[driver],error:null};
   if(table==='companies')return {data:this.singular?company:[company],error:null};
   if(table==='jobs'){
    if(this.singular){await hold('job');if(config.mode==='missing')return {data:null,error:null};return {data:{...job,status:config.mode==='canceled'?'キャンセル':job.status},error:null}}
    return {data:config.portal==='company'?[]:[job],error:null};
   }
   if(table==='applications')return {data:(config.hasApplication||state.submitted)&&!state.deleted?[{id:43,job_id:42,driver_id:7,status:'応募中',jobs:job}]:[],error:null};
   if(table==='company_public_names')return {data:[{company_id:9,company_name:'架空運送'}],error:null};
   return {data:this.singular?null:[],error:null};
  }
 }
 const db={auth:{getSession:async()=>({data:{session:{user:fixtureUser}},error:null}),getUser:async()=>({data:{user:fixtureUser},error:null}),signOut:async()=>{record({auth:'signOut'});return {error:null}}},rpc:async name=>{if(name!=='get_job_hiring_counts')throw Error('Unexpected fixture RPC');record({rpc:name});return {data:[{job_id:42,hired_count:0}],error:null}},from:table=>new Query(table),functions:{invoke:async(name,options)=>{
  record({function:name,body:options?.body});if(name!=='delete-account')throw Error('Unexpected fixture function');
  await hold('withdraw');if(config.mode==='withdraw_transport')throw Error('Synthetic response lost');
  if(config.mode==='withdraw_ok')return {data:{ok:true},error:null};
  return {data:{error:'retention_review_required'},error:null};
 }}};
 window.supabase={createClient:()=>db};
}
