"use strict"

/******************************************************************************
 * ReqBE
 ******************************************************************************/
var ReqBE=app.ReqBE=function(req, res){
  this.req=req; this.res=res; this.site=req.site; this.pool=DB[this.site.db].pool; this.Str=[]; 
  this.Out={GRet:{userInfoFrDBUpd:{}}, dataArr:[]}; this.GRet=this.Out.GRet; 
}




ReqBE.prototype.go=function*(){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
   

    // Extract input data either 'POST' or 'GET'
  var jsonInput;
  if(req.method=='POST'){ 
    if('x-type' in req.headers ){ //&& req.headers['x-type']=='single'
      var form = new formidable.IncomingForm();
      form.multiples = true;  
      //form.uploadDir='tmp';
      
      var err, fields, files;
      form.parse(req, function(errT, fieldsT, filesT) { err=errT; fields=fieldsT; files=filesT; flow.next();  });  yield;
      if(err){this.mesEO(err);  return; } 
      
      this.File=files['fileToUpload[]'];
      if('kind' in fields) this.kind=fields.kind; else this.kind='v';
      if(!(this.File instanceof Array)) this.File=[this.File];
      jsonInput=fields.vec;

    }else{
      var buf, myConcat=concat(function(bufT){ buf=bufT; flow.next();  });    req.pipe(myConcat);    yield;
      jsonInput=buf.toString();
    }
  }
  else if(1){
    var tmp='send me a POST'; this.mesO(tmp);   return;
  }
  else if(req.method=='GET'){
    var objUrl=url.parse(req.url), qs=objUrl.query||''; jsonInput=urldecode(qs);
  }

  try{ var beArr=JSON.parse(jsonInput); }catch(e){ console.log(e); res.out500('Error in JSON.parse, '+e); return; }
  
  
  this.sessionMain=yield *getRedisVar(flow, req.sessionID+'_Main'); // sets this.sessionMain
    // Checking for 'user' in userInfoFrDB is for backward compatibility
  if(!this.sessionMain || typeof this.sessionMain!='object' || !('userInfoFrDB' in this.sessionMain) || !('user' in this.sessionMain.userInfoFrDB) ) {
    this.sessionMain={userInfoFrDB:extend({}, specialistDefault)};
  }
  yield* setRedisVar(flow, req.sessionID+'_Main', this.sessionMain);  // This will also postpone the expiration time

  this.sessionLogin=yield *getRedisVar(flow, req.sessionID+'_Login');
  if(!this.sessionLogin || typeof this.sessionLogin!='object' || !('userInfoFrIP' in this.sessionLogin) ) { this.sessionLogin={userInfoFrIP:0};}
  yield* setRedisVar(flow, req.sessionID+'_Login', this.sessionLogin, maxLoginUnactivity);  // This will also postpone the expiration time
  
  
  res.setHeader("Content-type", "application/json");


    // Remove 'CSRFCode' and 'caller' form beArr
  var CSRFIn, caller='index';
  for(var i=beArr.length-1;i>=0;i--){ 
    var row=beArr[i];
    if(row[0]=='CSRFCode') {CSRFIn=row[1]; array_removeInd(beArr,i);}
    else if(row[0]=='caller') {caller=row[1]; array_removeInd(beArr,i);}
  }

  var len=beArr.length;
  var StrInFunc=Array(len); for(var i=0;i<len;i++){StrInFunc[i]=beArr[i][0];}
  var arrCSRF, arrNoCSRF, allowed, boCheckCSRF, boSetNewCSRF;
  if(caller=='index'){
      // Arrays of functions
    arrCSRF=['UUpdate','VIntroCB','RIntroCB','VSetPosCond','VUpdate','VShow','VHide','VDelete','SUseRebateCode','teamLoad','teamSaveName','teamSave','rebateCodeCreate','adminMonitorClear',
    'reportUpdateComment','reportUpdateAnswer','setSetting','deleteImage', 'uploadImage','loginGetGraph', 'sendTempPassword', 'loginWEmail'];  // Functions that changes something must check and refresh CSRF-code
    arrNoCSRF=['setupById','setUpCond','setUp','getList','getGroupList','getHist','VPaymentList','adminNVendor','reportOneGet','reportVGet','reportRGet','logout','getSetting'];  // ,'testA','testB'
    allowed=arrCSRF.concat(arrNoCSRF);

      // Assign boCheckCSRF and boSetNewCSRF
    boCheckCSRF=0; boSetNewCSRF=0;   for(var i=0; i<beArr.length; i++){ var row=beArr[i]; if(in_array(row[0],arrCSRF)) {  boCheckCSRF=1; boSetNewCSRF=1;}  }    
    if(StrComp(StrInFunc,['setUpCond','setUp','getList','getGroupList','getHist']) || StrComp(StrInFunc,['getSetting','setupById','VSetPosCond', 'setUpCond','setUp','getList','getGroupList','getHist']))
        { boCheckCSRF=0; boSetNewCSRF=1; }
  }else if(caller=='pubKeyStore'){
    arrCSRF=['pubKeyStore','loginGetGraph'];   arrNoCSRF=['setupById','logout'];   allowed=arrCSRF.concat(arrNoCSRF);

      // Assign boCheckCSRF and boSetNewCSRF
    boCheckCSRF=0; boSetNewCSRF=0;   for(var i=0;i<beArr.length; i++){ var row=beArr[i]; if(in_array(row[0],arrCSRF)) {  boCheckCSRF=1; boSetNewCSRF=1;}  }
    if(StrComp(StrInFunc,['setupById'])){ boCheckCSRF=0; boSetNewCSRF=1; }
  }else if(caller=='mergeID'){
    arrCSRF=['mergeID','loginGetGraph'];   arrNoCSRF=['setupById','logout'];   allowed=arrCSRF.concat(arrNoCSRF);

      // Assign boCheckCSRF and boSetNewCSRF
    boCheckCSRF=0; boSetNewCSRF=0;   for(var i=0;i<beArr.length; i++){ var row=beArr[i]; if(in_array(row[0],arrCSRF)) {  boCheckCSRF=1; boSetNewCSRF=1;}  }
    if(StrComp(StrInFunc,['setupById'])){ boCheckCSRF=0; boSetNewCSRF=1; }

  }else {debugger; }

    // cecking/set CSRF-code
  var redisVar=req.sessionID+'_CSRFCode'+ucfirst(caller), CSRFCode;
  if(boCheckCSRF){
    if(!CSRFIn){ var tmp='CSRFCode not set (try reload page)', error=new MyError(tmp); this.mesO(tmp); return;}
    var tmp=yield* wrapRedisSendCommand(flow, 'get',[redisVar]);
    if(CSRFIn!==tmp){ var tmp='CSRFCode err (try reload page)', error=new MyError(tmp); this.mesO(tmp); return;}
  }
  if(boSetNewCSRF){
    var CSRFCode=randomHash();
    var tmp=yield* wrapRedisSendCommand(flow, 'set',[redisVar,CSRFCode]);
    var tmp=yield* wrapRedisSendCommand(flow, 'expire',[redisVar,maxUnactivity]);
    this.GRet.CSRFCode=CSRFCode;
  }

  var Func=[];
  for(var k=0; k<beArr.length; k++){
    var strFun=beArr[k][0];
    if(in_array(strFun,allowed)) {
      var inObj=beArr[k][1],     tmpf; if(strFun in this) tmpf=this[strFun]; else tmpf=global[strFun];
      var fT=[tmpf,inObj];   Func.push(fT);
    }
  }

  for(var k=0; k<Func.length; k++){
    var [func,inObj]=Func[k];
    var objT=yield* func.call(this, inObj);
    if(typeof objT=='undefined' || objT.err || objT instanceof(Error)) {
      if(!res.finished) { res.out500(objT.err); } return;
    }else{
      this.Out.dataArr.push(objT.result);
    }      
  }
  this.mesO();

}

ReqBE.prototype.mes=function(str){ this.Str.push(str); }
ReqBE.prototype.mesO=function(str){
  if(str) this.Str.push(str);
  this.GRet.strMessageText=this.Str.join(', ');
  this.GRet.userInfoFrIP=this.sessionLogin.userInfoFrIP;
  this.res.end(JSON.stringify(this.Out));  
}
ReqBE.prototype.mesEO=function(err){
  var error=new MyError(err); console.log(error.stack);
  var strTmp;   
  if(typeof err=='object' && 'syscal' in err) strTmp='E: '+err.syscal+' '+err.code; else strTmp=err;
  this.Str.push(strTmp);
  //var tmp=err.syscal||''; this.Str.push('E: '+tmp+' '+err.code);
  this.GRet.strMessageText=this.Str.join(', ');
  this.GRet.userInfoFrIP=this.sessionLogin.userInfoFrIP;
  this.res.end(JSON.stringify(this.Out));
}




/******************************************************************************
 * sendTempPassword  and loginWEmail
 ******************************************************************************/

ReqBE.prototype.sendTempPassword=function*(inObj){ 
  var self=this, req=this.req, flow=req.flow, site=req.site;
  var userTab=site.TableName.userTab;

  var expirationTime=600;
  var Ou={};
  var email=inObj.email;


  var Sql=[], Val=[];
  Sql.push("SELECT email FROM "+userTab+" WHERE email=?;");
  Val.push(email);

  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  if(results.length==0) { this.mes('No such email in the database'); return {err:null, result:[Ou]};}
  
  var code=randomHash();
  var redisVar=code+'_verifyEmail';
  var tmp=yield* wrapRedisSendCommand(flow, 'set',[redisVar,email]);
  var tmp=yield* wrapRedisSendCommand(flow, 'expire',[redisVar,expirationTime]);
  
  var wwwSite=req.wwwSite;
  var strTxt='<h3>Temporary password for '+wwwSite+'</h3> \n\
<p>Someone (maybe you) uses '+wwwSite+' and wants a temporary password for '+email+'. Is this you, then here is the temporary password: <b>'+code+'</b> .</p> \n\
<p>Otherwise neglect this message.</p> \n\
<p>Note! The password stops working '+expirationTime/60+' minutes after the email was sent.</p>';
  
  const msg = { to:email, from:'noreply@closeby.market', subject:'Temporary password',  html:strTxt};    sgMail.send(msg);
  this.mes('Email sent'); Ou.boOK=1;
  
  return {err:null, result:[Ou]};
}

ReqBE.prototype.loginWEmail=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, objQS=req.objQS;
  var userTab=site.TableName.userTab;
  var Ou={};

  var code=inObj.code;
  var redisVar=code+'_verifyEmail';
  var email=yield* wrapRedisSendCommand(flow, 'get',[redisVar]);
  if(!email) {this.mesEO('No such code'); return {err:'exited'}; }
  if(email!=inObj.email) {this.mesEO('email does not match'); return {err:'exited'}; }


  var sql="SELECT idUser FROM "+userTab+" WHERE email=?;", Val=[email];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  if(results.length==0) { this.mes('No such email in the database'); return {err:null, result:[Ou]};}
  
  this.sessionLoginWEmail=results[0].idUser;

  return {err:null, result:[Ou]};
}

/******************************************************************************
 * loginGetGraph
 ******************************************************************************/
ReqBE.prototype.loginGetGraph=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, objQS=req.objQS;
  var strFun=inObj.fun;
  var Ou={};
  if(!this.sessionMain.userInfoFrDB){ this.sessionMain.userInfoFrDB=extend({},specialistDefault); yield *setRedisVar(flow, req.sessionID+'_Main', this.sessionMain);  }
  

  var strIP=inObj.IP;
  var rootDomain=req.rootDomain, objIPCred=rootDomain[strIP];
  var uRedir=req.strSchemeLong+site.wwwLoginRet;
    // getToken
  var objForm={grant_type:'authorization_code', client_id:objIPCred.id, redirect_uri:uRedir, client_secret:objIPCred.secret, code:inObj.code};
  var uToGetToken=UrlToken[strIP]; 

  var arrT = Object.keys(objForm).map(function (key) { return key+'='+objForm[key]; }), strQuery=arrT.join('&'); 
  //if(strQuery.length) uToGetToken+='?'+strQuery;
  //var reqStream=requestMod.get(uToGetToken).on('error', function(err) { if(err) console.log(err);  })
  var reqStream=requestMod.post({url:uToGetToken, form: objForm},  function(err) { if(err) console.log(err);  })
  var semCB=0, semY=0, boDoExit=0, buf;
  var myConcat=concat(function(bufT){ 
    buf=bufT
    if(semY)flow.next(); semCB=1;
  });
  reqStream.pipe(myConcat);
  if(!semCB){semY=1; yield;}  if(boDoExit==1) {return {err:'exited'}; }

 
  try{ var objT=JSON.parse(buf.toString()); }catch(e){ console.log(e); res.out500('Error in JSON.parse, '+e);  return {err:'exited'}; }
  var access_token=this.access_token=objT.access_token;
  //var access_token=this.access_token=inObj.access_token;


    // Get Graph
  if(strIP=='fb') {
    var objForm={access_token:this.access_token, fields:"id,name,verified,picture,email"};
  }else if(strIP=='google') {
    var objForm={access_token:this.access_token, fields:"id,name,verified,image,email"};
  }else if(strIP=='idplace') {
    var objForm={access_token:this.access_token};
  } 
  var uGraph=UrlGraph[strIP];
  
  var arrT = Object.keys(objForm).map(function (key) { return key+'='+objForm[key]; }), strQuery=arrT.join('&'); 
  if(strQuery.length) uGraph+='?'+strQuery;
  var reqStream=requestMod.get(uGraph).on('error', function(err) { if(err) console.log(err);  });
  //var reqStream=requestMod.post({url:uGraph, form: objForm},  function(err) { if(err) console.log(err);  })
  var semCB=0, semY=0, boDoExit=0, buf;
  var myConcat=concat(function(bufT){ 
    buf=bufT
    if(semY)flow.next(); semCB=1;
  });
  reqStream.pipe(myConcat);
  if(!semCB){semY=1; yield;}  if(boDoExit==1) {return {err:'exited'}; }

  //var tmp=JSON.myParse(buf.toString()), err=tmp[0], objGraph=tmp[1];    if(err) { console.log(err); res.out500('Error in JSON.parse, '+err); return {err:'exited'}; }
  try{ var objGraph=JSON.parse(buf.toString()); }catch(e){ console.log(e); console.log(buf.toString()); res.out500('Error in JSON.parse, '+e);  return {err:'exited'}; }
  this.objGraph=objGraph;

    // interpretGraph
  if('error' in objGraph) {console.log('Error accessing data from ID provider: '+objGraph.error.type+' '+objGraph.error.message+'<br>');  debugger; return; }


  if(strIP=='fb'){ 
    if(!objGraph.verified) { var tmp="Your facebook account is not verified. Try search internet for  \"How to verify facebook account\".";  res.out500(tmp);  debugger; return; }
    var IP='fb', idIP=objGraph.id, nameIP=objGraph.name, email=objGraph.email, image=objGraph.picture.data.url;
  }else if(strIP=='google'){
    var IP='google', idIP=objGraph.id, nameIP=objGraph.name.givenName+' '+objGraph.name.familyName, email=objGraph.email, image=objGraph.image.url;
  }else if(strIP=='idplace'){
    var IP='idplace', idIP=objGraph.id, nameIP=objGraph.name, email=objGraph.email, image=objGraph.image;
  }

  if(typeof idIP=='undefined') {console.log("Error idIP is empty");}  else if(typeof nameIP=='undefined' ) {nameIP=idIP;}
  var userInfoFrIPCur={IP:IP, idIP:idIP, nameIP:nameIP, image:image, email:email};

  
  this.sessionLogin.userInfoFrIP=extend({},userInfoFrIPCur);   yield *setRedisVar(flow, req.sessionID+'_Login', this.sessionLogin, maxLoginUnactivity);
  
  
  if(['vendorFun', 'reporterFun', 'teamFun', 'marketerFun', 'adminFun', 'refreshFun', 'mergeIDFun'].indexOf(strFun)!=-1){
    var {err}=yield *this[strFun]();
    if(err){   if(err!='exited') res.out500(err); return {err:'exited'};  }
  }

  return {err:null, result:[Ou]};
}

ReqBE.prototype.reporterFun=function*(){
  //this.boRunById=true;
  return {err:null};
}
ReqBE.prototype.vendorFun=function*(){
  //this.boRunById=true;
  return {err:null};
}
ReqBE.prototype.teamFun=function*(){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, userTab=site.TableName.userTab, teamTab=site.TableName.teamTab;
  
  var Sql=[], {IP, idIP, nameIP, image, email}=this.sessionLogin.userInfoFrIP, Val=[IP, idIP, nameIP, image, email, nameIP, image, email];
  Sql.push("INSERT INTO "+userTab+" (IP, idIP, nameIP, image, email) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE idUser=LAST_INSERT_ID(idUser), nameIP=?, image=?, email=?;");
  Sql.push("INSERT INTO "+teamTab+" (idUser,created) VALUES (LAST_INSERT_ID(),now()) ON DUPLICATE KEY UPDATE created=VALUES(created);");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){ res.out500(err); return {err:'exited'}; }
  //this.boRunById=true;
  return {err:null};
}
ReqBE.prototype.marketerFun=function*(){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, userTab=site.TableName.userTab, marketerTab=site.TableName.marketerTab;
  
  var Sql=[], {IP, idIP, nameIP, image, email}=this.sessionLogin.userInfoFrIP, Val=[IP, idIP, nameIP, image, email, nameIP, image, email];
  Sql.push("INSERT INTO "+userTab+" (IP, idIP, nameIP, image, email) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE idUser=LAST_INSERT_ID(idUser), nameIP=?, image=?, email=?;");
  Sql.push("INSERT INTO "+marketerTab+" VALUES (LAST_INSERT_ID(),0,now()) ON DUPLICATE KEY UPDATE created=VALUES(created);");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){ res.out500(err); return {err:'exited'}; }
  //this.boRunById=true;
  return {err:null};
}
ReqBE.prototype.adminFun=function*(){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, userTab=site.TableName.userTab, adminTab=site.TableName.adminTab;
  
  var Sql=[], {IP, idIP, nameIP, image, email}=this.sessionLogin.userInfoFrIP, Val=[IP, idIP, nameIP, image, email, nameIP, image, email];
  Sql.push("INSERT INTO "+userTab+" (IP, idIP, nameIP, image, email) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE idUser=LAST_INSERT_ID(idUser), nameIP=?, image=?, email=?;");
  Sql.push("INSERT INTO "+adminTab+" VALUES (LAST_INSERT_ID(),0,now()) ON DUPLICATE KEY UPDATE created=VALUES(created);");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){ res.out500(err); return {err:'exited'}; }
  //this.boRunById=true;
  return {err:null};
}
ReqBE.prototype.refetchFun=function*(){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, userTab=site.TableName.userTab, teamTab=site.TableName.teamTab;
  var idUser=this.sessionMain.userInfoFrDB.user.idUser;
  var Sql=[], {IP, idIP, nameIP, image, email}=this.sessionLogin.userInfoFrIP, Val=[IP, idIP, nameIP, image, email, idUser];
  Sql.push("UPDATE "+userTab+" SET IP=?, idIP=?, nameIP=?, image=?, email=? WHERE idUser=?;");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){ res.out500(err); return {err:'exited'}; }
  //this.boRunById=true;
  return {err:null};
}



ReqBE.prototype.setupById=function*(inObj){ //check  idIP (or idUser) against the vendor-table and return diverse data
"use strict"
  var req=this.req, flow=req.flow, site=req.site, siteName=site.siteName, Ou={};
  
  var StrRole=null; if(inObj && typeof inObj=='object' && 'Role' in inObj) StrRole=inObj.Role;
  
  var StrRoleAll=['vendor','team','marketer','admin','reporter'];
  if(typeof StrRole=='undefined' || !StrRole) StrRole=StrRoleAll; 
  if(typeof StrRole=='string') StrRole=[StrRole];

  var userInfoFrDBUpd={};
  
  var {IP,idIP}=this.sessionLogin.userInfoFrIP;
  var idUser=this.sessionMain.userInfoFrDB.user.idUser||null;
  if(!idUser) idUser=this.sessionLoginWEmail||null;
  var BoTest={};
  for(var i=0;i<StrRoleAll.length;i++) { var strRole=StrRoleAll[i]; BoTest[strRole]=StrRole.indexOf(strRole)!=-1; }
  var Sql=[], Val=[idUser, IP, idIP, BoTest.vendor, BoTest.team, BoTest.marketer, BoTest.admin, BoTest.reporter];
  Sql.push("CALL "+siteName+"GetUserInfo(?, ?, ?, ?, ?, ?, ?, ?, @OboOk, @Omess);");
  var sql=Sql.join('\n');
  
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err) { this.mesEO(err);   return {err:'exited'}; }
  var res=results[0], c=res.length; 
  if(c==1) {
    userInfoFrDBUpd.user=res[0];
    var res=results[1], c=res.length; if(BoTest.vendor) userInfoFrDBUpd.vendor=c==1?res[0]:0; //if(typeof userInfoFrDBUpd.vendor=='object') extend(userInfoFrDBUpd.vendor,userInfoFrDBU);
    var res=results[2]; if(BoTest.vendor && res.length && 'n' in res[0]  &&  userInfoFrDBUpd.vendor) userInfoFrDBUpd.vendor.nPayment=res[0].n;  
    var res=results[3], c=res.length; if(BoTest.team) userInfoFrDBUpd.team=c==1?res[0]:0; //if(typeof userInfoFrDBUpd.team=='object') extend(userInfoFrDBUpd.team,userInfoFrDBU);
    var res=results[4], c=res.length; if(BoTest.marketer) userInfoFrDBUpd.marketer=c==1?res[0]:0; //if(typeof userInfoFrDBUpd.marketer=='object') extend(userInfoFrDBUpd.marketer,userInfoFrDBU); 
    var res=results[5], c=res.length; if(BoTest.admin) userInfoFrDBUpd.admin=c==1?res[0]:0; //if(typeof userInfoFrDBUpd.admin=='object') extend(userInfoFrDBUpd.admin,userInfoFrDBU);
    var res=results[6]; if(BoTest.reporter ) {   var  c=res[0].n;  userInfoFrDBUpd.reporter=c?{idUser:userInfoFrDBUpd.user.idUser, c:c}:0;    }
  } else extend(userInfoFrDBUpd, specialistDefault);
  
  extend(this.GRet.userInfoFrDBUpd, userInfoFrDBUpd);   extend(this.sessionMain.userInfoFrDB, userInfoFrDBUpd);
  yield *setRedisVar(flow, req.sessionID+'_Main', this.sessionMain);
  
  return {err:null, result:[Ou]};
}



ReqBE.prototype.VSetPosCond=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site, Ou={};
 
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) {  return {err:null, result:[Ou]};}  // this.mes('No session');  // VSetPosCond is allways called when page is loaded (for vendors as well as any visitor) 
  var {idUser,coordinatePrecisionM}=vendor;
  var [xtmp,ytmp]=roundXY(coordinatePrecisionM,inObj[0],inObj[1]); inObj[0]=xtmp; inObj[1]=ytmp;

  var sql="UPDATE "+site.TableName.vendorTab+" SET x=?, y=? WHERE idUser=? ", Val=[inObj[0],inObj[1],idUser];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  return {err:null, result:[Ou]};
}


ReqBE.prototype.logout=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res;
  this.sessionMain={userInfoFrDB:extend({}, specialistDefault)};    yield *setRedisVar(flow, req.sessionID+'_Main', this.sessionMain);
  this.sessionLogin={userInfoFrIP:0};    yield *setRedisVar(flow, req.sessionID+'_Login', this.sessionLogin);
  this.GRet.userInfoFrDBUpd=extend({},specialistDefault);
  this.mes('Logged out'); return {err:null, result:[0]};
}



ReqBE.prototype.setUpCond=function*(inObj){
  var site=this.req.site, req=this.req, flow=req.flow, StrOrderFilt=site.StrOrderFilt, Prop=site.Prop;
  var Ou={};
  var tmp=setUpCond(site.KeySel, StrOrderFilt, Prop, inObj);
  copySome(this,tmp,['strCol', 'Where']);
  return {err:null, result:[Ou]};
}


ReqBE.prototype.setUp=function*(inObj){  // Set up some properties etc.  (termCond, VPSize, pC, zoom, boShowDummy).
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var vendorTab=site.TableName.vendorTab, userTab=site.TableName.userTab;
  
  var Ou={},  Sql=[];
  Sql.push("SELECT UNIX_TIMESTAMP(now()) AS now;");

  this.termCond=''; if(boTerminationCheck) this.termCond="now()<terminationDate";
  
  var zoom=Number(inObj.zoom), boCalcZoom=zoom==-1?1:0; 
  this.VPSize=inObj.VPSize;  
  this.pC=inObj.pC; var xC=Number(this.pC[0]), yC=Number(this.pC[1]), wVP=Number(this.VPSize[0]), hVP=Number(this.VPSize[1]); 
  //Sql.push("SET @xC="+xC+"; SET @yC="+yC+"; SET @wVP="+wVP+"; SET @hVP="+hVP+";
  

  //sql="UPDATE "+vendorTab+" SET boShow=0, posTime=now() WHERE boShow=1 AND now()>DATE_ADD(posTime, INTERVAL hideTimer SECOND)";
  Sql.push("CALL "+siteName+"IFunPoll;"); 

  if(boCalcZoom){  
      // If too few vehicles are visible then show the dummies
    Sql.push("SELECT (@boShowDummy:=count(u.idUser)<1) AS boShowDummy FROM "+userTab+" u JOIN "+vendorTab+" v ON u.idUser=v.idUser  WHERE boShow=1 AND !(idIP REGEXP '^Dummy');");
    Sql.push("SELECT count(u.idUser) AS nUserReal FROM "+userTab+" u JOIN "+vendorTab+" v ON u.idUser=v.idUser  WHERE  !(idIP REGEXP '^Dummy');");
    Sql.push("UPDATE "+userTab+" u JOIN "+vendorTab+" v ON u.idUser=v.idUser SET boShow=@boShowDummy, posTime=now() WHERE idIP REGEXP '^Dummy';");  

    
    //strCond=array_filter(Where).join(' AND '); if(strCond.length>0) strCond='AND '+strCond;
    var WhereTmp=this.Where.concat(["boShow=1",this.termCond]),  strCond=array_filter(WhereTmp).join(' AND ');
    
    var xOpp, xAddTerm; if(xC>128) {xOpp=xC-128; xAddTerm="IF(x<"+xOpp+",256,0)";}  else {xOpp=xC+128;  xAddTerm="IF(x>"+xOpp+",-256,0)"; } // xOpp : x of opposite side of planet
    var tmp="min(greatest(abs(x+"+xAddTerm+"-"+xC+"),abs(y-"+yC+")))";
    Sql.push("SELECT "+tmp+" AS distMin FROM "+vendorTab+" v WHERE "+strCond+";");
  }
  var sql=Sql.join('\n'), Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }  
  this.GRet.curTime=results[0][0].now; 
  if(boCalcZoom){
    this.GRet.boShowDummy=results[2][0].boShowDummy;
    this.GRet.nUserReal=results[3][0].nUserReal||0; 
    var distMin=results[5][0].distMin; 
    var minVP=Math.min(wVP,hVP);    
    if(distMin>0.001){
      var zFac=minVP/distMin;
      var z=Math.log2(zFac/2);
      zoom=Math.floor(z);
      zoom=bound(zoom,0,15);
    } else zoom=15;
  }
  this.zoom=zoom;
  return {err:null, result:[Ou]};
}  

//ReqBE.prototype.addMapCond=function*(inObj){}

ReqBE.prototype.getList=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var TableName=site.TableName, vendorTab=TableName.vendorTab, userTab=TableName.userTab, teamTab=TableName.teamTab, reportTab=TableName.reportTab;
  var strCol=this.strCol;
  var Ou={};
  this.tab=[];this.NVendor=[0,0];
  var xl,xh,yl,yh;
  if(this.zoom>1){
    var projs=new MercatorProjection();
    //var sw, ne, tmp=projs.getBounds(inObj.pC,this.zoom,inObj.VPSize);   sw=tmp[0]; ne=tmp[1];  xl=sw[0]; xh=ne[0]; yl=ne[1]; yh=sw[1];
    var sw, ne, tmp=projs.getBounds(this.pC,this.zoom,this.VPSize);   sw=tmp[0]; ne=tmp[1];  xl=sw[0]; xh=ne[0]; yl=ne[1]; yh=sw[1];
  }  else {xl=0; xh=256; yl=0; yh=256;}
  if(xh-xl>256) {xl=0; xh=256;}
  [xl]=normalizeAng(xl,128,256);   [xh]=normalizeAng(xh,128,256);
  this.whereMap="y>"+yl+" AND y<"+yh+" AND "; if(xl<xh) this.whereMap+="x>"+xl+" AND x<"+xh; else this.whereMap+="(x>"+xl+" OR x<"+xh+")";
  //this.WhereM=this.Where.concat(whereMap);
  
  var Sql=[];
  var WhereTmp=this.Where.concat([this.whereMap,"boShow=1",this.termCond]),  strCond=array_filter(WhereTmp).join(' AND ');
  Sql.push("SELECT SQL_CALC_FOUND_ROWS "+strCol+" FROM (("+vendorTab+" v NATURAL JOIN "+userTab+" u) LEFT JOIN "+teamTab+" dis on dis.idUser=v.idTeam) LEFT JOIN "+reportTab+" rb ON rb.idVendor=v.idUser \
WHERE "+strCond+" GROUP BY v.idUser ORDER BY posTime DESC LIMIT 0, "+maxVendor+";");

  Sql.push("SELECT FOUND_ROWS() AS n;"); // nFound

  var WhereTmp=[this.whereMap,"boShow=1",this.termCond],  strCond=array_filter(WhereTmp).join(' AND ');
  Sql.push("SELECT count(*) AS n FROM "+vendorTab+" v WHERE "+strCond+";"); // nUnFiltered
 
  var sql=Sql.join('\n'), Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  var nFound=results[1][0].n;
  this.boUseOrdinaryList=nFound<=maxVendor;
  if(this.boUseOrdinaryList){
    for(var i=0;i<results[0].length;i++) {
      var row=results[0][i], len=site.KeySel.length; 
      var rowN=Array(len); //for(var j=0;j<len;j++) { rowN[j]=row[j];}
      for(var j=0;j<len;j++){ var key=site.KeySel[j]; rowN[j]=row[key]; }
      this.tab.push(rowN);
    }      
  } 
  this.Str.push("Found: "+nFound);  
  this.NVendor=[nFound, results[2][0].n];
  return {err:null, result:[Ou]};
}

ReqBE.prototype.getGroupList=function*(inObj){  
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var vendorTab=site.TableName.vendorTab;
  var Ou={};
  this.groupTab=[];
  if(this.boUseOrdinaryList) {return {err:null, result:[Ou]};}
  var Sql=[];
  //var zoomFac=Math.pow(2,this.zoom-4.3);
  var zoomFac=Math.pow(2,this.zoom-5);
  var WhereTmp=this.Where.concat([this.whereMap, "boShow=1", this.termCond]),  strCond=array_filter(WhereTmp).join(' AND ');
  Sql.push("SELECT round(x*"+zoomFac+")/"+zoomFac+" AS roundX, round(y*"+zoomFac+")/"+zoomFac+" AS roundY, count(*) AS n FROM "+vendorTab+" v \
                 WHERE "+strCond+" GROUP BY roundX, roundY;");
  var sql=Sql.join('\n'), Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  for(var i=0;i<results.length;i++) {var {roundX,roundY,n}=results[i]; this.groupTab.push([roundX,roundY,n]); }
  return {err:null, result:[Ou]};
}

ReqBE.prototype.getHist=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, vendorTab=site.TableName.vendorTab;
  var Ou={}
  var arg={strTableRef:vendorTab+' v', Ou:Ou, WhereExtra:[this.whereMap, "boShow=1", this.termCond]};  // , strTableRefCount:vendorTab+' v'
  copySome(arg, site, ['Prop','StrOrderFilt']);
  copySome(arg, this, ['Where']); arg.strDBPrefix=site.siteName;

  var {err, Hist}=yield* getHist(flow, this.pool, arg); if(err){ this.mesEO(err); return {err:'exited'};  } 
  Ou.Hist=Hist; copySome(Ou, this,['zoom', 'tab', 'NVendor', 'groupTab']);
  return {err:null, result:[Ou]};
}


/*********************************************************************************************
 * User-function
 *********************************************************************************************/

ReqBE.prototype.UUpdate=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var userTab=site.TableName.userTab;
  var Ou={};
  var {user}=this.sessionMain.userInfoFrDB; if(!user) { this.mes('No session'); return {err:null, result:[Ou]};}
  var idUser=user.idUser;
  
  var Sql=[], Val=[];
  Val.push(inObj.email, idUser);
  Sql.push("UPDATE "+userTab+" SET email=? WHERE idUser=?;");
  
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var c=results.affectedRows, mestmp=c+" affected row"; if(c!=1) mestmp+='s';
  
  this.mes(mestmp);      
  return {err:null, result:[Ou]};
}


/*********************************************************************************************
 * Vendor-functions
 *********************************************************************************************/

ReqBE.prototype.VIntroCB=function*(inObj){ // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName, Prop=site.Prop;
  var vendorTab=site.TableName.vendorTab, userTab=site.TableName.userTab;
  var Ou={}; 
  var objT=this.sessionLogin.userInfoFrIP;  if(!objT) {this.mes('No session'); return {err:null, result:[Ou]}; }
  var {IP, idIP, nameIP, image, email}=objT;
  
  var Sql=[], Val=[];
  Sql.push("CALL "+siteName+"vendorSetup(?,?,?,?,?,?,@boInserted,@idUser);");
  Val.push(null, IP, idIP, nameIP, image, email);
  Sql.push("SELECT @boInserted AS boInserted;");

  Sql.push("SELECT count(*) AS n FROM "+userTab+" WHERE !(idIP REGEXP '^Dummy');");

  Sql.push("UPDATE "+userTab+" SET email=? WHERE idUser=@idUser;");
  Sql.push("UPDATE "+vendorTab+" SET displayName=?, currency=? WHERE idUser=@idUser;");
  Val=Val.concat(inObj.email, inObj.displayName, inObj.currency+1);
  
  if(payLev==0) {
    Sql.push("UPDATE "+vendorTab+" SET nMonthsStartOffer='"+intMax+"', terminationDate=FROM_UNIXTIME("+intMax+") WHERE idUser =LAST_INSERT_ID() AND @boInserted;");  
  }
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  var boIns=site.boGotNewVendors=Number(results[1][0].boInserted);
  site.nUser=Number(results[2][0].n);
  var  tmpMes='Data '+(boIns?'inserted':'updated'); this.mes(tmpMes);
  return {err:null, result:[Ou]};
}


ReqBE.prototype.VUpdate=function*(inObj){ // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName, Prop=site.Prop;
  var vendorTab=site.TableName.vendorTab, userTab=site.TableName.userTab;
  //var VendorUpdF=site.VendorUpdF;
  var Ou={}; 
  var user=this.sessionMain.userInfoFrDB.user, userInfoFrIP=this.sessionLogin.userInfoFrIP, objT;
  if(user) objT=user;  else if(userInfoFrIP) objT=userInfoFrIP;  else {this.mes('No session'); return {err:null, result:[Ou]}; }
  var {idUser, IP, idIP, nameIP, image, email}=objT; 
  if(typeof IP=='number') IP=site.Prop.IP.Enum[IP];
  if(typeof idUser=='undefined') idUser=null;

  var objVar=extend({},inObj);
  
  var boPrice='boPrice' in objVar; if(boPrice) delete objVar.boPrice;
  var boInsert='boInsert' in objVar; if(boInsert) delete objVar.boInsert;
  if('image' in objVar) delete objVar.image;
    
  var arrK=[], arrVal=[], arrUpdQM=[];
  for(var name in objVar){
    if(site.arrAllowed.indexOf(name)==-1) {return {err:'Forbidden input'};}
    arrK.push(name);
    var value=objVar[name]; if(typeof value!='number') {value=this.pool.escape(value);  value=value.slice(1, -1); }
    var QMark='?';
    //if(name in VendorUpdF) { var tmp=VendorUpdF[name].call(site.Enum,name,value);  QMark=tmp[0]; value=tmp[1]; }
    if('vendorUpdF' in Prop[name]) { var tmp=Prop[name].vendorUpdF.call(Prop,name,value);  QMark=tmp[0]; value=tmp[1]; }

    objVar[name]=value;
    arrVal.push(value);
    //QMark=QMark.replace(/\?/,value); 
    arrUpdQM.push("`"+name+"`="+QMark);
  }
  var strCol=arrK.join(', ');
  var strUpdQM=arrUpdQM.join(', ');
    
  var Sql=[], Val=[];
  Sql.push("CALL "+siteName+"vendorSetup(?,?,?,?,?,?,@boInserted,@idUser);");
  Val.push(idUser, IP, idIP, nameIP, image, email);
  Sql.push("SELECT @boInserted AS boInserted;");

  Sql.push("SELECT count(*) AS n FROM "+userTab+" WHERE !(idIP REGEXP '^Dummy');");

  var strTeamTmp='';     if('idTeamWanted' in objVar) {    var idTmp=Number(objVar.idTeamWanted);    strTeamTmp=", idTeamWanted="+idTmp+", idTeam= IF(idTeam="+idTmp+",idTeam,0)";      }
  var strPriceTmp='';  if(boPrice) strPriceTmp=', lastPriceChange=now()';
  var tmp=strUpdQM+" "+strPriceTmp+" "+strTeamTmp;
  if(tmp.length>2) {
    Sql.push("UPDATE "+vendorTab+" SET "+tmp+" WHERE idUser=@idUser;");
    Val=Val.concat(arrVal);
  }

  if(payLev==0) {
    Sql.push("UPDATE "+vendorTab+" SET nMonthsStartOffer='"+intMax+"', terminationDate=FROM_UNIXTIME("+intMax+") WHERE idUser =LAST_INSERT_ID() AND @boInserted;");  
  }
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  site.boGotNewVendors=Number(results[1][0].boInserted);
  site.nUser=Number(results[2][0].n);
  this.mes('Data updated');      
  return {err:null, result:[Ou]};
}



ReqBE.prototype.VDelete=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var userTab=site.TableName.userTab;
  var Ou={};
  var {user}=this.sessionMain.userInfoFrDB; if(!user) { this.mes('No session'); return {err:null, result:[Ou]};}
  var idUser=user.idUser; 
  
  var Sql=[], Val=[];
  Sql.push("DELETE FROM "+userTab+" WHERE idUser=?;"); Val.push(idUser);
  
  this.sessionMain={userInfoFrDB:extend({}, specialistDefault)};    yield *setRedisVar(flow, req.sessionID+'_Main', this.sessionMain);
  extend(this.GRet.userInfoFrDBUpd, specialistDefault); 

  Sql.push("SELECT count(*) AS n FROM "+userTab+" WHERE !(idIP REGEXP '^Dummy');");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  site.boGotNewVendors=1; // variabel should be called boNUsers changed or something..
  site.nUser=Number(results[1][0].n);
  this.mes('deleted');      
  return {err:null, result:[Ou]};
}


ReqBE.prototype.VShow=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var vendorTab=site.TableName.vendorTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou,'errFunc']};}
  var {idUser,coordinatePrecisionM}=vendor;
  var [xtmp,ytmp]=roundXY(coordinatePrecisionM,inObj[0],inObj[1]); inObj[0]=xtmp; inObj[1]=ytmp;

  var Sql=[], Val=[];
  Sql.push("CALL "+siteName+"TimeAccumulatedUpdOne("+idUser+");"); 
  Sql.push("UPDATE "+vendorTab+" SET x=?, y=?, boShow=1, posTime=now(), histActive=histActive|1 WHERE idUser="+idUser+";");
  Val=[inObj[0],inObj[1]];
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  this.mes('Vendor visible');      
  return {err:null, result:[Ou]};
}
ReqBE.prototype.VHide=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var vendorTab=site.TableName.vendorTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou,'errFunc']};}
  var idUser=user.idUser; 

  var Sql=[], Val=[];
  Sql.push("CALL "+siteName+"TimeAccumulatedUpdOne("+idUser+");"); 
  Sql.push("UPDATE "+vendorTab+" SET boShow=0, posTime=0, histActive=histActive|1 WHERE idUser="+idUser+";");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  this.mes('Vendor hidden');      
  return {err:null, result:[Ou]};
}



ReqBE.prototype.SUseRebateCode=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var vendorTab=site.TableName.vendorTab, rebateCodeTab=site.TableName.rebateCodeTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou,'errFunc']};}
  var idUser=user.idUser; 
  
  var Sql=[], Val=[];
  var code=this.pool.escape(inObj.rebateCode);
  Sql.push("CALL "+siteName+"UseRebateCode("+code+", "+idUser+", @monthsToAdd, @boOK, @mess);");
  Sql.push("SELECT @monthsToAdd AS monthsToAdd, @boOK AS boOK, @mess AS mess;");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var monthsToAdd=results[1][0].monthsToAdd, boOK=results[1][0].boOK, mess=results[1][0].mess;
  if(!boOK) this.mes(mess);
  else {
    if(monthsToAdd!=intMax) tmpStr=monthsToAdd+" months added "; else tmpStr='Free account';     this.mes(tmpStr);
  }
  return {err:null, result:[Ou]};
}



ReqBE.prototype.VPaymentList=function*(inObj){ // needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var paymentTab=site.TableName.paymentTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou,'errFunc']};}
  var idUser=user.idUser; 

  var offset=Number(inObj.offset), rowCount=Number(inObj.rowCount);
  var Sql=[], Val=[];
  var strCol="txn_id, payer_email, amount, currency, tax, VATNumber, monthsToAdd, UNIX_TIMESTAMP(payment_date) AS payment_date, UNIX_TIMESTAMP(created) AS created";
  Sql.push("SELECT SQL_CALC_FOUND_ROWS "+strCol+" FROM "+paymentTab+" WHERE idUser="+idUser+" ORDER BY paymentNumber ASC LIMIT "+offset+", "+rowCount+";"); 

  Sql.push("SELECT FOUND_ROWS() AS n;");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  var Ou=arrObj2TabNStrCol(results[0]);
  Ou.nCur=results[0].length;
  Ou.nTot=results[1][0].n;
  return {err:null, result:[Ou]};
}


ReqBE.prototype.adminNVendor=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site, vendorTab=site.TableName.vendorTab;
  var sql="SELECT count(*) AS n FROM "+vendorTab, Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var Ou={}; Ou.n=results[0].n;
  return {err:null, result:[Ou]};
}
ReqBE.prototype.adminMonitorClear=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var userTab=site.TableName.userTab;
  var Ou={};
  var {user, admin}=this.sessionMain.userInfoFrDB; if(!user || !admin) { this.mes('No session'); return {err:null, result:[Ou,'errFunc']};}
  if(!admin.boApproved) { this.mes('Not approved'); return {err:null, result:[Ou,'errFunc']}; }
  var sql="SELECT count(*) AS n FROM "+userTab+" WHERE !(idIP REGEXP '^Dummy');", Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  Ou.n=results[0].n;
  return {err:null, result:[Ou]};
}


ReqBE.prototype.rebateCodeCreate=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var rebateCodeTab=site.TableName.rebateCodeTab;
  var Ou={};
  var {user, marketer}=this.sessionMain.userInfoFrDB; if(!user || !marketer) { this.mes('No session'); return {err:null, result:[Ou]};}
  var {idUser,boApproved}=marketer;
  if(!boApproved) { this.mes('Marketer not approved'); return {err:null, result:[Ou]}; }
    
  var months=Number(inObj.months); 
  var code=genRandomString(rebateCodeLen);


  var sql="INSERT INTO "+rebateCodeTab+" ( idUser, months, code, created, validTill) VALUES (?,?,?, now(), DATE_ADD(now(), INTERVAL 1 MONTH))";
  var Val=[idUser, months, code];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  this.mes(months+" months, Code: "+code);
  return {err:null, result:[Ou]};
}


ReqBE.prototype.reportUpdateComment=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var reportTab=site.TableName.reportTab;
  var Ou={};
  var user=this.sessionMain.userInfoFrDB.user, userInfoFrIP=this.sessionLogin.userInfoFrIP, objT;
  if(user) objT=user;  else if(userInfoFrIP) objT=userInfoFrIP;  else {this.mes('No session'); return {err:null, result:[Ou]}; }
  var {IP, idIP, nameIP, image, email}=objT; 
  if(typeof IP=='number') IP=site.Prop.IP.Enum[IP];
  
  var idVendor=inObj.idVendor;
  var comment=inObj.comment;  comment=comment.substr(0,10000);
  if(comment.length==0) comment=null;
  var Sql=[], Val=[];
  Sql.push("CALL "+siteName+"reporterSetup(?, ?, ?, ?, ?, @boInserted, @idReporter);");  Val.push(IP, idIP, nameIP, image, email);
  Sql.push("INSERT INTO "+reportTab+" (idVendor,idReporter,comment,created) VALUES (?,@idReporter,?,now()) ON DUPLICATE KEY UPDATE comment=?, modified=now();");
  Val.push(idVendor,comment,comment);
  Sql.push("DELETE FROM "+reportTab+" WHERE comment IS NULL AND answer IS NULL;");
  Sql.push("SELECT count(*) AS n FROM "+reportTab+" WHERE idReporter=@idReporter;");  
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; } 
  var StrMes=[];
  var c=results[1].affectedRows; if(c==1) StrMes.push("Entry inserted"); else if(c==2) StrMes.push("Entry updated");
  var c=results[2].affectedRows; if(c==1) StrMes.push("Entry deleted"); else if(c>1) StrMes.push(c+" entries deleted");
  var n=results[3][0].n; if(n==0) StrMes.push("No comments remaining");
  var mestmp=StrMes.join(', ');
  this.mes(mestmp);

  return {err:null, result:[Ou]};
}
ReqBE.prototype.reportUpdateAnswer=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var reportTab=site.TableName.reportTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou]};}

  var idReporter=inObj.idReporter;
  var idVendor=user.idUser;
  var answer=inObj.answer;  answer=answer.substr(0,10000);
  if(answer.length==0) answer=null;
  var Sql=[], Val=[];
  Sql.push("UPDATE "+reportTab+" SET answer=? WHERE idVendor=? AND idReporter=?;");
  Val.push(answer,idVendor,idReporter);
  Sql.push("DELETE FROM "+reportTab+" WHERE  comment IS NULL AND answer IS NULL;");
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var StrMes=[];
  var c=results[0].affectedRows; if(c==1) StrMes.push("Entry updated"); else if(c>1) StrMes.push(c+" entries updated");
  var c=results[1].affectedRows; if(c==1) StrMes.push("Entry deleted"); else if(c>1) StrMes.push(c+" entries deleted");
  var mestmp=StrMes.join(', ');
  this.mes(mestmp);
  return {err:null, result:[Ou]};
}

ReqBE.prototype.reportOneGet=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var userTab=site.TableName.userTab,  reportTab=site.TableName.reportTab;
  var Ou={};   
  //debugger
  var {user, vendor, reporter}=this.sessionMain.userInfoFrDB; //if(!user) { this.mes('No session'); return {err:null, result:[Ou]};}
  var idReporter, idVendor;
  if('idReporter' in inObj) idReporter=inObj.idReporter;  else if(reporter) idReporter=reporter.idUser; else{ this.mes('Not Logged in'); return {err:null, result:[Ou]}; }
  if('idVendor' in inObj) idVendor=inObj.idVendor; else if(vendor) idVendor=vendor.idUser; else{ this.mes('Not Logged in'); return {err:null, result:[Ou]}; }
  
  var sql="SELECT comment, answer FROM "+userTab+" u JOIN "+reportTab+" r ON u.idUser=r.idVendor WHERE idVendor=? AND idReporter=? "; 
  var Val=[idVendor,idReporter];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var c=results.length; 
  var mestmp; if(c>0){ Ou.row=results[0]; mestmp="Feedback fetched"; }else{ Ou.row={}; mestmp="No existing feedback";}
  this.mes(mestmp);
  return {err:null, result:[Ou]};
}



ReqBE.prototype.reportVGet=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var reportTab=site.TableName.reportTab, userTab=site.TableName.userTab;
  var Ou={};   
  var offset=Number(inObj.offset), rowCount=Number(inObj.rowCount);
  
  var idVendor=inObj.idVendor;
  var Sql=[], Val=[];
  Sql.push("SELECT SQL_CALC_FOUND_ROWS idReporter, nameIP, image, comment, answer, UNIX_TIMESTAMP(created) AS created FROM "+reportTab+" r JOIN "+userTab+" u ON r.idReporter=u.idUser WHERE idVendor=? ORDER BY created DESC LIMIT "+offset+","+rowCount+";"); 
  Val.push(idVendor);
  Sql.push("SELECT FOUND_ROWS() AS n;");
  var sql=Sql.join("\n ");
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var Ou=arrObj2TabNStrCol(results[0]);
  Ou.nCur=results[0].length; 
  Ou.nTot=results[1][0].n;
  return {err:null, result:[Ou]};
}
ReqBE.prototype.reportRGet=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var TableName=site.TableName, userTab=TableName.userTab, vendorTab=TableName.vendorTab, reportTab=TableName.reportTab;
  var Ou={};   
  var offset=Number(inObj.offset), rowCount=Number(inObj.rowCount);

  var idReporter=inObj.idReporter;
  var Sql=[], Val=[];
  Sql.push("SELECT SQL_CALC_FOUND_ROWS u.idUser, IP, idIP, image, displayName, boImgOwn, imTag, comment, answer, UNIX_TIMESTAMP(r.created) AS created FROM "+userTab+" u JOIN "+vendorTab+" v ON u.idUser=v.idUser JOIN "+reportTab+" r ON u.idUser=r.idVendor WHERE idReporter=? ORDER BY r.created DESC LIMIT "+offset+","+rowCount+";"); 
  Val.push(idReporter); 
  Sql.push("SELECT FOUND_ROWS() AS n;"); 
  var sql=Sql.join("\n ");
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var Ou=arrObj2TabNStrCol(results[0]);
  Ou.nCur=results[0].length; 
  Ou.nTot=results[1][0].n;   
  //this.mes("Found: "+nCur);
  return {err:null, result:[Ou]};
}



ReqBE.prototype.teamSaveName=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var teamTab=site.TableName.teamTab;
  var Ou={};
  var {user, team}=this.sessionMain.userInfoFrDB; if(!user || !team) { this.mes('No session'); return {err:null, result:[Ou]};}
  var {idUser, boApproved}=team; if(!boApproved){this.mes('Team not approved'); return {err:null, result:[Ou]};}

  var link=this.pool.escape(inObj.link);  
  var sql="UPDATE "+teamTab+" SET link=? WHERE idUser=?;", Val=[link, idUser];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  this.mes('Data saved');
  return {err:null, result:[Ou]};
}
ReqBE.prototype.teamSave=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var vendorTab=site.TableName.vendorTab;
  var Ou={};
  var {user, team}=this.sessionMain.userInfoFrDB; if(!user) { this.mes('No session'); return {err:null, result:[Ou]};}
  if(!team.boApproved){ this.mes('Team not approved'); return {err:null, result:[Ou]};}
  
  var idUser=Number(inObj.idUser),   boOn=Number(inObj.boOn); 
  var sql="UPDATE "+vendorTab+" SET idTeam=IF(?,idTeamWanted,0) WHERE idUser=?;", Val=[boOn,idUser];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  this.mes('Data saved');
  return {err:null, result:[Ou]};
}

ReqBE.prototype.teamLoad=function*(inObj){  // writing needSession
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var userTab=site.TableName.userTab, vendorTab=site.TableName.vendorTab;
  var Ou={};
  var {user, team}=this.sessionMain.userInfoFrDB; if(!user || !team) { this.mes('No session'); return {err:null, result:[Ou]};}
  var {idUser, boApproved, imTag, link}=team;  if(boApproved==0){ this.mes('Team not approved'); return {err:null, result:[Ou]};}
  
  copySome(Ou, team, ['idUser', 'imTag', 'link']);

  var TmpCol=['u.idUser', 'IP', 'idIP', 'displayName', 'idTeam', 'imTag'];
  for(var i=0;i<TmpCol.length;i++){TmpCol[i]+=" AS '"+i+"'";} 
  var strCol=TmpCol.join(', ');
  var sql="SELECT "+strCol+" FROM "+vendorTab+" v JOIN "+userTab+" u ON v.idUser=u.idUser WHERE idTeamWanted=?";
  var Val=[idUser];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var nRow=results.length;
  if(nRow==0) { this.mes('No vendors connected');  }
  else{
    Ou.tab=[];
    for(var i=0;i<nRow;i++) {
      var row=results[i], len=5;
      var rowN=Array(len); for(var j=0;j<len;j++) { rowN[j]=row[j];}
      Ou.tab.push(rowN);
    }
  }
  return {err:null, result:[Ou]};
}


ReqBE.prototype.deleteImage=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var vendorImageTab=site.TableName.vendorImageTab, vendorTab=site.TableName.vendorTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou]};}
  var idUser=user.idUser;

  var Sql=[];
  Sql.push("DELETE FROM "+vendorImageTab+" WHERE idUser="+idUser+";");
  Sql.push("UPDATE "+vendorTab+" SET boImgOwn=0 WHERE idUser="+idUser+";");
  var sql=Sql.join("\n "), Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var nDel=results[0].affectedRows; 
  if(nDel==1) {this.mes('Image deleted'); } else { this.mes(nDel+" images deleted!?");}
  return {err:null, result:[Ou]};
}


ReqBE.prototype.pubKeyStore=function*(inObj){
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var pubKeyTab=site.TableName.pubKeyTab;
  var Ou={};
  var {user, vendor}=this.sessionMain.userInfoFrDB; if(!user || !vendor) { this.mes('No session'); return {err:null, result:[Ou]};}
  var idUser=user.idUser;
  var pubKey=inObj.pubKey;
  var sql="INSERT INTO "+pubKeyTab+" (idUser,pubKey) VALUES (?, ?) ON DUPLICATE KEY UPDATE pubKey=VALUES(pubKey), iSeq=0";
  var Val=[idUser,pubKey];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  var boOK=0, nUpd=results.affectedRows, mestmp; 
  if(nUpd==1) {boOK=1; mestmp="Key inserted"; } else if(nUpd==2) {boOK=1; mestmp="Key updated";} else {boOK=1; mestmp="(same key)";}
  Ou.boOK=boOK;    Ou.strMess=mestmp;
  return {err:null, result:[Ou]};
}


ReqBE.prototype.getSetting=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var settingTab=site.TableName.settingTab;
  var Ou={};
  var Str=['payLev','boTerminationCheck','boShowTeam'];
  if(!isAWithinB(inObj,Str)) {this.mes('Illegal invariable'); return {err:null, result:'getSetting'}; }
  for(var i=0;i<inObj.length;i++){ var name=inObj[i]; Ou[name]=app[name]; }
  return {err:null, result:[Ou]};
}
ReqBE.prototype.setSetting=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site; 
  var settingTab=site.TableName.settingTab;
  var Ou={};
  var StrApp=[],  StrServ=[];
  if(this.sessionMain.userInfoFrDB.admin) StrApp=['payLev','boTerminationCheck','boShowTeam'];  
  var Str=StrApp.concat(StrServ);
  var Key=Object.keys(inObj);
  if(!isAWithinB(Key, Str)) { this.mes('Illegal invariable'); return {err:null, result:'setSetting'};}
  for(var i=0;i<Key.length;i++){ var name=Key[i], tmp=Ou[name]=inObj[name]; if(StrApp.indexOf(name)!=-1) app[name]=tmp; else serv[name]=tmp; }
  return {err:null, result:[Ou]};    
}

ReqBE.prototype.getDBSetting=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var settingTab=site.TableName.settingTab;
  var Ou={};
  if(!isAWithinB(inObj,['payLev','boTerminationCheck','boShowTeam'])) {this.mes('Illegal invariable'); return {err:null, result:'getSetting'};}
  var strV=inObj.join("', '");
  var sql="SELECT * FROM "+settingTab+" WHERE name IN('"+strV+"')";
  var Val=[];
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  for(var i=0; i<results.length;i++){ var tmp=results[i]; Ou[tmp.name]=tmp.value;  }
  return {err:null, result:[Ou]};
}

ReqBE.prototype.setDBSetting=function*(inObj){ 
  var req=this.req, flow=req.flow, res=this.res, site=req.site;
  var settingTab=site.TableName.settingTab;
  var Ou={};
  var Str=[];
  if(this.sessionMain.userInfoFrDB.admin) Str=['payLev','boTerminationCheck','boShowTeam','boGotNewVendors','nUser'];  
  var Key=Object.keys(inObj);
  if(!isAWithinB(Key, Str)) { this.mes('Illegal invariable'); return {err:null, result:'setSetting'};}

  var Sql=[], sqlA="INSERT INTO "+settingTab+" (name,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?";
  for(var name in inObj){
    var value=inObj[name];
    Sql.push(sqlA); Val.push(name,value,value);
    Ou[name]=value;
  }
  var sql=Sql.join("\n ");
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){this.mesEO(err); return {err:'exited'}; }
  for(var name in inObj){
    var value=inObj[name];        Ou[name]=value;
  }
  return {err:null, result:[Ou]};
}




ReqBE.prototype.uploadImage=function*(inObj){
  var self=this, req=this.req, flow=req.flow, res=this.res, site=req.site, siteName=site.siteName;
  var Ou={};
  var regImg=RegExp("^(png|jpeg|jpg|gif|svg)$");

  var File=this.File;
  var n=File.length; this.mes("nFile: "+n);

  var file=File[0], tmpname=file.path, fileName=file.name; 
  var Match=RegExp('\\.(\\w{1,3})$').exec(fileName); 
  if(!Match){ Ou.strMessage="The file name should have a three or four letter extension, ex: \".xxx\""; return {err:null, result:[Ou]}; }
  var type=Match[1].toLowerCase();
  var err, buf;
  fs.readFile(tmpname, function(errT, bufT) { err=errT; buf=bufT;  flow.next();  }); yield;
  if(err){ this.mesEO(err); return {err:'exited'}; }
  var data=buf; 
  if(data.length==0){ this.mes("data.length==0"); return {err:null, result:[Ou]}; }

  if(!regImg.test(type)){ Ou.strMessage="Unrecognized file type: "+type; return {err:null, result:[Ou]}; }


  var semY=0, semCB=0, boDoExit=0;
  var myCollector=concat(function(buf){
    data=buf;
    if(semY) { flow.next(); } semCB=1;
  }); 
  var streamImg=gm(data).autoOrient().resize(50, 50).stream(function streamOut(err, stdout, stderr) {
    if(err){ boDoExit=1; self.mesEO(err); return; } 
    stdout.pipe(myCollector); 
  });
  if(!semCB) { semY=1; yield;}
  if(boDoExit==1) {return {err:'exited'}; }

  //var kind=this.kind||'v';
  var boTeam=this.kind=='t';

  var TableName=site.TableName, vendorTab=TableName.vendorTab, teamTab=TableName.teamTab, vendorImageTab=TableName.vendorImageTab, teamImageTab=TableName.teamImageTab;
  var {user, vendor, team}=this.sessionMain.userInfoFrDB; if(!user || !vendor || (boTeam && !team)) { this.mes('No session'); return {err:null, result:[Ou]};}
  var strKind=boTeam?'team':'vendor', idUser=this.sessionMain.userInfoFrDB[strKind].idUser;
  
  console.log('uploadImage data.length: '+data.length);
  if(data.length==0) {this.mesEO('data.length==0');  return {err:'exited'}; }
  
  var tab; if(boTeam) tab=teamImageTab; else tab=vendorImageTab;
  var Sql=[], Val=[];
  Sql.push("REPLACE INTO "+tab+" (idUser,data) VALUES (?,?);"); Val.push(idUser,data);
  if(boTeam){     Sql.push("UPDATE "+teamTab+" SET imTag=imTag+1 WHERE idUser=?;");  Val.push(idUser); }
  else {    Sql.push("UPDATE "+vendorTab+" SET boImgOwn=1,imTag=imTag+1 WHERE idUser=?;");  Val.push(idUser);    }
  
  //var sql='INSERT INTO imgTab SET ?';
  var sql=Sql.join('\n');
  var {err, results}=yield* myQueryGen(flow, sql, Val, this.pool);
  if(err){res.out500(err);  return {err:'exited'};   } 

  Ou.strMessage="Done";
  return {err:null, result:[Ou]};
}



