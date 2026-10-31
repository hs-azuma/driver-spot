// Real restored Auth/PostgREST/RPC flow. No notification provider is invoked.
export async function businessFlow({company,driver,outsider,companyId,today,check}){
 const profile=await driver.from('drivers').select('id').single();check('Business restored driver profile',!profile.error&&!!profile.data?.id);
 const job=await company.from('jobs').insert({company_id:companyId,job_description:'Synthetic complete workflow',location:'Synthetic site',work_date:today,start_time:'09:00',end_time:'18:00',break_minutes:60,pay_type:'時給',pay_amount:1200,pay_guarantee:true,transportation_fee_type:'金額指定',transportation_fee:500}).select('id').single();check('Business company publishes payable job',!job.error&&!!job.data?.id);
 const app=await driver.from('applications').insert({job_id:job.data.id,driver_id:profile.data.id,status:'応募中'}).select('id').single();check('Business driver applies through RLS',!app.error&&!!app.data?.id);
 const hired=await company.from('applications').update({status:'勤務確定'}).eq('id',app.data.id).eq('status','応募中').select('id');check('Business company confirms exactly one hire',!hired.error&&hired.data.length===1);
 const qr=await company.rpc('attendance_company_qr',{p_regenerate:false});check('Business company obtains QR token',!qr.error&&!!qr.data?.token);
 const args={p_token:qr.data.token,p_application_id:app.data.id};
 const foreign=await outsider.rpc('punch_company_qr',{...args,p_action:'in'});check('Business foreign driver cannot punch',!!foreign.error);
 const early=await driver.rpc('punch_company_qr',{...args,p_action:'out'});check('Business checkout before checkin refused',!!early.error);
 const arrived=await driver.rpc('punch_company_qr',{...args,p_action:'in'});check('Business real QR checkin',!arrived.error&&arrived.data.already_recorded===false);
 const repeated=await driver.rpc('punch_company_qr',{...args,p_action:'in'});check('Business repeated checkin idempotent',!repeated.error&&repeated.data.already_recorded===true);
 const left=await driver.rpc('punch_company_qr',{...args,p_action:'out'});check('Business real QR checkout completes work',!left.error&&left.data.already_recorded===false);
 const payArgs={p_application_id:app.data.id,p_checked_in_at:arrived.data.checked_in_at,p_checked_out_at:left.data.checked_out_at,p_break_minutes:0,p_reason:'Synthetic QR pay confirmation',p_transportation_fee:500,p_pay_guarantee:true};
 const request=await driver.rpc('request_pay_confirmation',payArgs);check('Business driver requests pay confirmation',!request.error&&typeof request.data==='string');
 const duplicate=await driver.rpc('request_pay_confirmation',payArgs);check('Business duplicate pending payroll request refused',!!duplicate.error);
 const approved=await company.rpc('decide_attendance_review',{p_request_id:request.data,p_approve:true,p_comment:'Synthetic native approval',p_pay_guarantee:true});check('Business company approves payroll',!approved.error);
 const result=await driver.from('attendance_review_requests').select('status,approved_basic_amount,approved_transportation_fee,approved_total_amount').eq('id',request.data).single();check('Business guaranteed payroll equals 9600 plus 500',!result.error&&result.data.status==='approved'&&Number(result.data.approved_basic_amount)===9600&&Number(result.data.approved_transportation_fee)===500&&Number(result.data.approved_total_amount)===10100);
 const redo=await company.rpc('decide_attendance_review',{p_request_id:request.data,p_approve:true,p_comment:'retry',p_pay_guarantee:true});check('Business repeated payroll approval refused',!!redo.error);
 const rotated=await company.rpc('attendance_company_qr',{p_regenerate:true});check('Business QR regeneration changes token',!rotated.error&&rotated.data.token!==qr.data.token);
 const invalid=await driver.rpc('punch_company_qr',{...args,p_action:'in'});check('Business invalidated QR token refused',!!invalid.error);
 return {status:'PASS_RESTORED_NATIVE_BUSINESS_FLOW',guaranteed_basic:9600,transport:500,total:10100,external_delivery_tested:false};
}
