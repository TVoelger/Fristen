import { createIcons, ArrowLeft, Bookmark, Check, ChevronDown, ChevronRight, Plus, TriangleAlert, X } from 'lucide';
import { createDialog } from './dialog.js';
import { todayInBerlin, deadlineEndsAt, dayNumber, dayAfter, validDay, historyStamp } from '../domain/time.ts';
import { canManageProject, planProjectDeletion, deleteProject } from '../domain/projects.ts';

export function createApp(root, data, repository) {
  const lucide={createIcons:()=>createIcons({icons:{ArrowLeft, Bookmark, Check, ChevronDown, ChevronRight, Plus, TriangleAlert, X},root,attrs:{width:16,height:16}})};
    const content=root.querySelector('#ff-content');
    const live=root.querySelector('#ff-live');
    let now=Date.now();
    let today=todayInBerlin(now);
    const {people,projects,matters,items,userSettings,assistantSettings}=data;
    const partnerIds=Object.keys(people).filter(id=>people[id].role==='partner');
    const lawyerIds=Object.keys(people).filter(id=>people[id].role!=='assistant');
    const assistantIds=Object.keys(people).filter(id=>people[id].role==='assistant');
    const kinds={internal:'Interne Frist',urgency:'Dringlichkeitsfrist',enforcement:'Vollziehungsfrist',pleading:'Frist'};
    let nextDeadlineId=data.nextDeadlineId;
    const state={user:data.activeUser,role:people[data.activeUser].role,view:'deadlines',scope:people[data.activeUser].role==='partner'?'responsibility':'mine',detail:null,edit:null,projectEdit:null,projectDeleteStage:null,projectDeleteMode:'keep',projectDeleteReviewed:'',newParent:null,preliminaryDraft:'',collapsed:new Set()};
    const dialog=createDialog(root,()=>{state.newParent=null;state.preliminaryDraft='';navigate('deadlines');});
    let renderedList='';
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const icon=name=>'<i data-lucide="'+name+'" aria-hidden="true"></i>';
    const get=id=>items.find(d=>d.id===id);
    const user=()=>state.user;
    const pname=id=>userSettings[user()].nameDisplay==='full'?people[id].name:people[id].initials;
    const personNames=ids=>ids.map(pname).join(', ');
    const partnerNames=personNames;
    const partnerLabel=ids=>'('+partnerNames(ids)+')';
    const personRef=id=>'{{person:'+id+'}}';
    const personRefs=ids=>ids.map(personRef).join(', ');
    const partnerRefs=ids=>'('+personRefs(ids)+')';
    const historyText=value=>String(value).replace(/\{\{person:([a-z0-9_-]+)\}\}/g,(match,id)=>Object.prototype.hasOwnProperty.call(people,id)?pname(id):match);
    const inherits=d=>!!d.project&&d.partners===null;
    const effectivePartners=d=>inherits(d)?projects[d.project].partners:(d.partners||[]);
    const assigned=(d,id)=>d.assignees.includes(id);
    const responsible=(d,id)=>effectivePartners(d).includes(id);
    const mine=(d,id)=>assigned(d,id)||responsible(d,id);
    const mayEdit=d=>!!d&&(state.role!=='lawyer'||mine(d,user()));
    const mayEditProject=id=>canManageProject(currentData(),id,user());
    const projectLabel=id=>id?projects[id].name:'Ohne Projekt · eigenständige Frist';
    const exceptionLabel=d=>d.kind==='pleading'&&d.notfrist?'Notfrist':d.kind==='urgency'||d.kind==='enforcement'?kinds[d.kind]:'';
    const kindLabel=d=>exceptionLabel(d)||(d.kind==='internal'?'Interne Frist':'Keine Kennzeichnung');
    const exceptionMarkup=d=>exceptionLabel(d)?' <span class="ff-exception">'+esc(exceptionLabel(d))+'</span>':'';
    const end=deadlineEndsAt;
    const date=day=>{
      const instant=new Date(day+'T12:00:00+02:00');
      const value=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'}).format(instant);
      const weekday=new Intl.DateTimeFormat('de-DE',{weekday:'short',timeZone:'Europe/Berlin'}).format(instant);
      return value+' ('+weekday.replace(/\.$/,'')+'.)';
    };
    const dueLabel=d=>date(d.day)+(d.time&&d.time!=='day'?' · '+d.time+' Uhr':'');
    const barScale={defaultWeeks:6,orangeAt:14,redAt:7};
    const subscriptions=Object.fromEntries(Object.entries(data.subscriptions).map(([id,values])=>[id,new Set(values)]));
    const isSubscribed=(d,id=user())=>subscriptions[id].has(d.id);
    const coverageActive=(coverage,on=today)=>!!coverage&&coverage.from<=on&&on<=coverage.until;
    const supports=(d,assistant)=>assistantSettings[assistant].lawyers.some(id=>mine(d,id));
    const ownOverview=(d,id)=>people[id].role==='assistant'?supports(d,id):assigned(d,id);
    const incomingCoverage=(id,on=today)=>assistantIds.filter(source=>{
      const coverage=assistantSettings[source].coverage;
      return coverage?.deputy===id&&coverageActive(coverage,on);
    });
    const inOverview=(d,id,on=today)=>ownOverview(d,id)||incomingCoverage(id,on).some(source=>supports(d,source));
    const subscriptionOnly=(d,id=user(),on=today)=>isSubscribed(d,id)&&!inOverview(d,id,on);
    function inScope(available,scope=state.scope,id=user(),on=today){
      if(scope==='all')return available;
      if(scope==='mine')return available.filter(d=>inOverview(d,id,on)||isSubscribed(d,id));
      if(scope==='responsibility')return people[id].role==='partner'?available.filter(d=>responsible(d,id)):[];
      return available.filter(d=>mine(d,scope));
    }
    function overviewContext(){
      if(state.scope!=='mine')return '';
      const parts=[];
      if(state.role==='assistant'){
        const lawyers=assistantSettings[user()].lawyers;
        parts.push(lawyers.length?'Für '+lawyers.map(pname).join(', '):'Noch keine Anwälte zugeordnet');
      }
      incomingCoverage(user()).forEach(source=>parts.push('Vertretung für '+pname(source)+' bis '+date(assistantSettings[source].coverage.until)));
      return parts.join(' · ');
    }
    const assistantsFor=d=>assistantIds.filter(id=>supports(d,id));
    function assistanceMeta(d){
      const assigned=assistantsFor(d);
      const deputies=assigned.filter(source=>coverageActive(assistantSettings[source].coverage));
      return '<dt>Assistenz</dt><dd>'+esc(assigned.length?personNames(assigned):'Noch keine Zuordnung')+'</dd>'+(deputies.length?'<dt>Vertretung</dt><dd>'+deputies.map(source=>{
        const coverage=assistantSettings[source].coverage;
        return esc(pname(coverage.deputy)+' für '+pname(source)+' bis '+date(coverage.until));
      }).join('<br>')+'</dd>':'');
    }
    const spanWeeks=()=>userSettings[user()].weeks;
    const spanLabel=()=>spanWeeks()+' '+(spanWeeks()===1?'Woche':'Wochen');
    const urgencyTone=remaining=>remaining<=barScale.redAt?'red':remaining<=barScale.orangeAt?'orange':'green';
    const openPreliminary=d=>d.preliminary&&!d.preliminary.done&&d.status!=='Erledigt';
    function preliminaryState(d,at=now){
      if(!d.preliminary)return null;
      const remaining=(end({day:d.preliminary.day,time:'day'})-at)/86400000;
      const active=!!openPreliminary(d);
      return {remaining,active,overdue:active&&remaining<=0,tone:!active?'muted':d.kind==='internal'?'blue':urgencyTone(remaining)};
    }
    function barState(d,at=now){
      const remaining=Math.max(0,(end(d)-at)/86400000),maxDays=spanWeeks()*7;
      const preliminary=preliminaryState(d,at),hasEarlier=preliminary?.active&&preliminary.remaining<remaining;
      const nextRemaining=hasEarlier?preliminary.remaining:remaining;
      return {remaining,maxDays,width:Math.min(100,remaining/maxDays*100),more:remaining>maxDays,tone:d.kind==='internal'?'blue':urgencyTone(nextRemaining),next:hasEarlier?'preliminary':'deadline',nextRemaining,preliminary};
    }
    function nextLabel(d,bar){
      if(bar.next==='preliminary'){
        const p=bar.preliminary,days=dayNumber(d.preliminary.day)-dayNumber(today);
        return p.overdue?'Vorfrist überfällig':days===0?'Vorfrist heute':days===1?'Vorfrist morgen':'Vorfrist in '+days+' Tagen';
      }
      const days=dayNumber(d.day)-dayNumber(today);
      return bar.remaining<=0?'Frist abgelaufen':days===0?'Ablauf heute':days===1?'Ablauf morgen':'Ablauf in '+days+' Tagen';
    }
    function deadlineBar(d,preliminary=d.preliminary){
      const display={...d,preliminary},bar=barState(display),preliminaryDay=preliminary?.day;
      const text=bar.remaining===0?'Frist abgelaufen':bar.remaining<1?'Weniger als ein Tag Restzeit':Math.ceil(bar.remaining)+' Tage Restzeit';
      const colorText=d.kind==='internal'?'Blau · interne Frist':({green:'Grün',orange:'Orange',red:'Rot'}[bar.tone])+' · '+nextLabel(display,bar);
      const accessible=text+'; volle Balkenlänge entspricht '+spanLabel()+(bar.more?'; Restzeit länger als die persönliche Skala':'')+'; '+colorText+(preliminaryDay?'; interne Vorfrist: '+date(preliminaryDay)+(preliminary.done?' (erledigt)':''):'')+(bar.preliminary?.active?'; blauer Abschnitt und blaue Raute markieren die Vorfrist':'');
      const p=bar.preliminary,preliminaryWidth=p?.active?Math.min(bar.width,Math.max(0,p.remaining/bar.maxDays*100)):0;
      const segment=preliminaryWidth>0?'<span class="ff-meter-preliminary" style="width:'+preliminaryWidth.toFixed(4)+'%" aria-hidden="true"></span>':'';
      const markerPosition=p?Math.min(100,Math.max(0,p.remaining/bar.maxDays*100)).toFixed(4):'0';
      const marker=p?.active&&p.remaining<=bar.maxDays?'<span class="ff-preliminary-pin" style="left:'+markerPosition+'%" aria-hidden="true"></span>':'';
      const annotation=p?.active?preliminaryDate(display,markerPosition,p.remaining>bar.maxDays):'';
      return '<span class="ff-meter-row" data-tone="'+bar.tone+'" data-has-preliminary-label="'+!!annotation+'" data-tooltip="'+esc(colorText)+'"><span class="ff-meter-track"><span class="ff-meter" role="meter" aria-label="Verbleibende Zeit bis zum Ablaufdatum" aria-valuemin="0" aria-valuemax="'+bar.maxDays+'" aria-valuenow="'+Math.min(bar.maxDays,bar.remaining).toFixed(3)+'" aria-valuetext="'+esc(accessible)+'"><span class="ff-meter-fill" data-tone="'+bar.tone+'" style="width:'+bar.width.toFixed(4)+'%"></span>'+segment+'</span>'+marker+annotation+'</span><span class="ff-meter-plus" aria-hidden="true">'+(bar.more?icon('plus'):'')+'</span></span>';
    }
    function preliminaryDate(d,position,outside=false){
      const p=preliminaryState(d);if(!p?.active)return '';
      const day=d.preliminary.day,shortDate=day.slice(8,10)+'.'+day.slice(5,7)+'.';
      const label='Interne Vorfrist: '+date(day)+(p.overdue?' · überfällig':'')+(outside?' · außerhalb der angezeigten Spanne':'');
      return '<span class="ff-preliminary-date" style="left:clamp(18px,'+position+'%,calc(100% - 18px))" data-tooltip="'+esc(label)+'" aria-hidden="true">'+shortDate+'</span>';
    }
    function preliminaryTimeline(d){
      const preliminary=state.preliminaryDraft?(state.preliminaryDraft===d.preliminary?.day?d.preliminary:{day:state.preliminaryDraft,done:false}):null;
      const display={...d,preliminary},bar=barState(display);
      return '<button type="button" class="ff-preliminary-timeline" data-preliminary-timeline aria-label="Interne Vorfrist auf der Zeitleiste wählen">'+deadlineBar(d,preliminary)+'</button><div class="ff-timeline-labels"><span>Heute</span><span>'+spanLabel()+'</span></div><p class="ff-timeline-status" role="status" aria-live="polite">'+esc(nextLabel(display,bar))+' · '+({green:'Grün',orange:'Orange',red:'Rot',blue:'Blau'}[bar.tone])+'</p>';
    }
    function preliminaryDayAt(d,fraction){return dayAfter(today,Math.min(Math.floor(Math.max(0,Math.min(1,fraction))*spanWeeks()*7),spanWeeks()*7-1,dayNumber(d.day)-dayNumber(today)-1));}
    function syncPreliminaryTimeline(){root.querySelector('#ff-preliminary-preview').innerHTML=preliminaryTimeline(get(state.detail));if(typeof lucide!=='undefined')lucide.createIcons({attrs:{width:16,height:16}});}
    const titleForScope=()=>state.scope==='mine'?'Meine Fristen':state.scope==='responsibility'?'Übersicht':state.scope==='all'?'Fristen Kanzlei':'Fristen von '+pname(state.scope);
    const projectOptions=selected=>'<option value="" '+(!selected?'selected':'')+'>Ohne Projekt · eigenständige Frist</option>'+Object.entries(projects).map(([id,p])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+esc(p.name)+'</option>').join('');
    const personChecks=(ids,selected,name)=>ids.map(id=>'<label class="ff-check"><input type="checkbox" name="'+name+'" value="'+id+'" '+(selected.includes(id)?'checked':'')+'><span'+(name==='partners'?' class="ff-partner-note"':'')+'>'+esc(name==='partners'?partnerLabel([id]):pname(id))+'</span></label>').join('');
    const partnerChecks=selected=>personChecks(partnerIds,selected,'partners');
    const validSelection=(values,allowed)=>values.length>0&&values.every(id=>allowed.includes(id));
    function scopeMenu(title=titleForScope()){
      return '<details class="ff-menu" id="ff-scope"><summary><h1>'+esc(title)+'</h1>'+icon('chevron-down')+'</summary><div class="ff-menu-body"><button type="button" data-scope="mine">Meine Fristen</button>'+(state.role==='partner'?'<button type="button" data-scope="responsibility">Übersicht</button>':'')+'<button type="button" data-scope="all">Fristen Kanzlei</button><div class="ff-menu-label ff-menu-separator">Nach Person</div>'+lawyerIds.map(id=>'<button type="button" data-scope="'+id+'">'+esc(pname(id))+'</button>').join('')+'</div></details>';
    }
    function subscriptionAction(d,compact=true){
      if(d.status==='Erledigt')return '';
      const subscribed=isSubscribed(d),automatic=inOverview(d,user());
      if(automatic&&!subscribed)return compact&&state.scope==='all'?'<span class="ff-subscribe" data-tooltip="Bereits über Zuständigkeit oder Betreuung in Meine Fristen enthalten">'+icon('check')+'<span class="ff-sr">Bereits in Meine Fristen enthalten</span></span>':'';
      if(compact&&state.scope!=='all'&&!subscribed)return '';
      const label=subscribed?'Abonnement beenden':'Zu Meine Fristen hinzufügen';
      return '<button type="button" class="'+(compact?'ff-subscribe':'ff-text-action ff-subscribe-text')+'" data-subscribe="'+d.id+'" aria-pressed="'+subscribed+'" aria-label="'+esc(label+': '+d.title)+'" data-tooltip="'+esc(label)+'">'+icon('bookmark')+(compact?'':'<span>'+label+'</span>')+'</button>';
    }
    function deadlineRow(d){
      const m=matters[d.matter];
      const status=d.status==='Erledigt'?'':[
        !d.verified?'Fristdaten ungeprüft':'',
        d.status==='Erledigungskontrolle offen'?'Erledigung prüfen':'',
        d.calendar==='Fehlgeschlagen'?'Outlook nicht aktualisiert':''
      ].filter(Boolean).join(' · ');
      const title=(d.project&&d.project===m.project?'':m.short+' · ')+d.title;
      const subscribedOnly=state.scope==='mine'&&subscriptionOnly(d);
      const subscriptionNote=subscribedOnly?'<span class="ff-subscription-note">abonniert</span>':'';
      const partnerNote=inherits(d)?'<span class="ff-sr">Partner vom Projekt: '+esc(partnerLabel(effectivePartners(d)))+'</span>':'<span class="ff-partner-note ff-partner-inline" data-tooltip="'+esc((d.project?'Individuelle Partnerzuordnung: ':'Partner: ')+partnerNames(effectivePartners(d)))+'">(<span class="ff-partner-text">'+esc(partnerNames(effectivePartners(d)))+'</span>)</span>';
      return '<div class="ff-row-shell" data-subscription-only="'+subscribedOnly+'"><button type="button" class="ff-row" data-open="'+d.id+'"><span class="ff-row-title"><span class="ff-row-title-line"><span class="ff-title" data-tooltip="'+esc(title)+'">'+esc(title)+'</span><span class="ff-row-reference"><span class="ff-row-az">('+esc(m.code)+')</span>'+exceptionMarkup(d)+'</span></span>'+(status?'<span class="ff-status ff-warning">'+esc(status)+'</span>':'')+'</span><span class="ff-date"><span class="ff-date-main '+(d.day<=today?'ff-today':'')+'">'+esc(dueLabel(d))+'</span></span><span class="ff-row-timeline"><span class="ff-owners"><span class="ff-sr">Zuständigkeit: </span><span class="ff-assignees" data-tooltip="'+esc(personNames(d.assignees))+'">'+esc(personNames(d.assignees))+'</span>'+partnerNote+'</span>'+subscriptionNote+deadlineBar(d)+'</span></button>'+subscriptionAction(d)+'</div>';
    }
    function rows(list){
      const sorted=[...list].sort((a,b)=>end(a)-end(b));
      if(!sorted.length&&!(state.scope==='all'&&Object.keys(projects).length))return '<p class="ff-empty">Keine offenen Einträge in dieser Ansicht.</p>';
      const roots=[],groups=new Map();
      for(const d of sorted){
        if(d.project){
          if(!groups.has(d.project)){const group={project:d.project,items:[],first:end(d)};groups.set(d.project,group);roots.push(group);}
          groups.get(d.project).items.push(d);
        }else roots.push({deadline:d,first:end(d)});
      }
      if(state.scope==='all')for(const id of Object.keys(projects))if(!groups.has(id))roots.push({project:id,items:[],first:Infinity});
      roots.sort((a,b)=>a.first-b.first);
      return '<div class="ff-deadline-list" data-name-display="'+userSettings[user()].nameDisplay+'" data-has-time="'+sorted.some(d=>d.time&&d.time!=='day')+'"><div class="ff-columns" aria-hidden="true"><span>Projekt / Frist</span><span>Ablauf · '+spanLabel()+'</span></div><div class="ff-hierarchy" aria-label="Projekte mit untergeordneten Fristen und eigenständige Fristen">'+roots.map(node=>{
        if(node.deadline)return deadlineRow(node.deadline);
        const first=node.items[0],p=projects[node.project],labelId='ff-project-'+node.project;
        const partnerText='('+esc(partnerNames(p.partners))+')';
        const partnerLine=mayEditProject(node.project)?'<button type="button" class="ff-tree-partners" data-project-partners="'+node.project+'" aria-label="Partner für '+esc(p.name)+' ändern">'+partnerText+'</button>':'<span class="ff-tree-partners">'+partnerText+'</span>';
        return '<details class="ff-tree-project" data-project-id="'+node.project+'" '+(state.collapsed.has(node.project)?'':'open')+'><summary><span class="ff-tree-chevron">'+icon('chevron-right')+'</span><span class="ff-tree-heading"><button type="button" class="ff-tree-name" id="'+labelId+'" data-project-open="'+node.project+'" aria-label="Projekt '+esc(p.name)+' öffnen">'+esc(p.name)+'</button> '+partnerLine+'</span>'+(first?'<span class="ff-tree-next"><span class="ff-muted">Nächster Ablauf</span><span class="'+(first.day<=today?'ff-today':'')+'">'+esc(dueLabel(first))+'</span></span>':'')+'</summary><div class="ff-tree-children" role="group" aria-labelledby="'+labelId+'">'+(node.items.length?node.items.map(d=>deadlineRow(d)).join(''):'<p class="ff-empty-project">Keine offenen Fristen</p>')+'</div></details>';
      }).join('')+'</div></div>';
    }
    function listView(){
      const list=inScope(items.filter(d=>d.status!=='Erledigt')),context=overviewContext();
      const emptySetup=!list.length&&state.scope==='mine'&&state.role==='assistant'&&!assistantSettings[user()].lawyers.length;
      return '<div class="ff-heading"><div>'+scopeMenu()+'<p class="ff-heading-sub">'+list.length+' offene Einträge'+(context?' · '+esc(context):'')+'</p></div><div class="ff-checks"><button type="button" class="ff-text-action" data-project-create>Projekt anlegen</button><button type="button" class="ff-primary" data-new>'+ (state.role==='lawyer'?'Frist ergänzen':'Frist erfassen')+'</button></div></div>'+(emptySetup?'<div class="ff-empty"><button type="button" class="ff-text-action" data-settings>Betreute Anwälte in den Einstellungen auswählen</button></div>':rows(list));
    }
    function detailView(){
      const d=get(state.detail),m=matters[d.matter],editable=mayEdit(d),internal=d.kind==='internal';
      const linked=items.filter(x=>x.parent===d.id).sort((a,b)=>end(a)-end(b));
      const doneButton=d.status==='Erledigt'?'':d.status==='Erledigungskontrolle offen'?(state.role!=='lawyer'?'<button type="button" class="ff-primary" data-edit="verify">Erledigung kontrollieren</button>':'<span class="ff-muted">Erledigungskontrolle offen</span>'):editable?'<button type="button" class="ff-primary" data-edit="complete">'+(internal?'Abschließen':'Erledigung melden')+'</button>':'';
      return '<div class="ff-detail"><div class="ff-detail-title"><h1>'+esc(d.title)+'</h1><p class="ff-heading-sub">'+esc(m.name)+' · '+esc(m.code)+exceptionMarkup(d)+'</p></div>'
        +'<div class="ff-detail-date"><div style="flex:1;min-width:0"><strong class="'+(d.day<=today?'ff-today':'')+'">'+esc(dueLabel(d))+'</strong><div class="ff-detail-meter">'+deadlineBar(d)+'</div></div>'+(editable?'<div class="ff-date-actions">'+(state.role!=='lawyer'||['internal','urgency'].includes(d.kind)?'<button type="button" class="ff-text-action" data-edit="date">Datum ändern</button>':'')+'<button type="button" class="ff-text-action" data-edit="preliminary">'+(d.preliminary?'Vorfrist ändern':'Vorfrist setzen')+'</button>'+(d.preliminary&&d.status!=='Erledigt'?'<button type="button" class="ff-text-action" data-preliminary-done>'+(d.preliminary.done?'Vorfrist wieder öffnen':'Vorfrist erledigen')+'</button>':'')+'</div>':'')+'</div>'
        +'<div class="ff-keyrow"><span class="ff-keylabel">Projekt</span><div>'+esc(projectLabel(d.project))+'</div>'+(editable?'<button type="button" class="ff-text-action" data-edit="project" aria-label="Projektzuordnung ändern">Ändern</button>':'')+'</div>'
        +'<div class="ff-keyrow"><span class="ff-keylabel">Zuständigkeit</span><div>'+esc(personNames(d.assignees))+'</div>'+(editable?'<button type="button" class="ff-text-action" data-edit="assign">Ändern</button>':'')+'</div>'
        +'<div class="ff-keyrow"><span class="ff-keylabel">Partner</span><div><span class="ff-partner-note">'+esc(partnerLabel(effectivePartners(d)))+'</span>'+(d.project?'<span class="ff-sub">'+(inherits(d)?'Vom Projekt übernommen':'Individuell für diese Frist')+'</span>':'')+'</div>'+(editable?'<button type="button" class="ff-text-action" data-edit="partners">Ändern</button>':'')+'</div>'
        +(d.parent?'<div class="ff-keyrow"><span class="ff-keylabel">Bezugsfrist</span><div><button type="button" data-open="'+d.parent+'">'+esc(get(d.parent).title)+'</button><span class="ff-sub">'+esc(dueLabel(get(d.parent)))+'</span></div></div>':'')
        +(linked.length?'<details class="ff-disclosure"><summary>Verknüpfte Fristen ('+linked.length+')'+icon('chevron-down')+'</summary><div class="ff-disclosure-content"><ul class="ff-steps">'+linked.map(x=>'<li class="ff-step"><button type="button" data-open="'+x.id+'">'+esc(x.title)+'</button><span class="ff-step-date">'+esc(dueLabel(x))+'</span></li>').join('')+'</ul></div></details>':'')
        +'<details class="ff-disclosure"><summary>Fristdaten & Verlauf'+icon('chevron-down')+'</summary><div class="ff-disclosure-content"><dl class="ff-meta"><dt>Grundlage</dt><dd>'+esc(d.source)+'</dd><dt>Fristdaten</dt><dd>'+(d.verified?'Prüfung bestätigt':'Ungeprüft')+'</dd>'+assistanceMeta(d)+'<dt>Kalenderabgleich</dt><dd>'+esc(d.calendar)+'</dd>'+(d.evidence?'<dt>Erledigungsvermerk</dt><dd>'+esc(d.evidence)+'</dd>':'')+'</dl><ul class="ff-history">'+d.history.map(h=>'<li>'+esc(historyText(h))+'</li>').join('')+'</ul></div></details>'
        +'<div class="ff-actions">'+doneButton+(!internal&&d.status!=='Erledigt'&&editable?'<button type="button" class="ff-text-action" data-add-internal>Interne Frist hinzufügen</button>':'')+(editable?'<button type="button" class="ff-text-action" data-edit="kind">Kennzeichnung ändern</button>':'')+subscriptionAction(d,false)+'</div></div>';
    }
    function formFrame(title,body,label,destructive=false){
      const back=state.edit||state.projectDeleteStage||state.view==='new'&&state.newParent;
      return '<div class="ff-detail ff-form">'+(back?'<button type="button" class="ff-back" data-cancel>'+icon('arrow-left')+'Zurück</button>':'')+'<div class="ff-detail-title"><h1>'+title+'</h1></div><form id="ff-form">'+body+'<div class="ff-actions"><button type="submit" class="ff-primary'+(destructive?' ff-danger':'')+'" id="ff-submit">'+label+'</button><button type="button" class="ff-text-action" data-cancel>Abbrechen</button></div><div class="ff-error" id="ff-error" role="alert"></div></form></div>';
    }
    function kindFields(kind,notfrist=false){
      const flag=exceptionLabel({kind,notfrist})?(notfrist?'notfrist':kind):'none';
      return '<label class="ff-field"><span>Kennzeichnung</span><select name="flag" id="ff-flag">'+Object.entries({none:'Keine',notfrist:'Notfrist',urgency:'Dringlichkeitsfrist',enforcement:'Vollziehungsfrist'}).map(([id,name])=>'<option value="'+id+'" '+(flag===id?'selected':'')+'>'+name+'</option>').join('')+'</select></label><div class="ff-fieldgroup" id="ff-internal-field" '+(flag!=='none'?'hidden':'')+'><label class="ff-check"><input type="checkbox" name="internal" id="ff-internal" '+(kind==='internal'?'checked':'')+' '+(flag!=='none'?'disabled':'')+'>Interne Frist</label></div>';
    }
    function typeFrom(fd){
      const flag=String(fd.get('flag')||'');
      if(!['none','notfrist','urgency','enforcement'].includes(flag))return null;
      return {kind:flag==='none'?(fd.get('internal')?'internal':'pleading'):flag==='notfrist'?'pleading':flag,notfrist:flag==='notfrist'};
    }
    function partnerFields(project,selected,inherit){
      return '<div id="ff-inherit-wrap" '+(!project?'hidden':'')+'><label class="ff-check"><input type="checkbox" name="inherit" id="ff-inherit" '+(inherit?'checked':'')+' '+(!project?'disabled':'')+'>Partner vom Projekt übernehmen</label><p class="ff-partner-source" id="ff-inherit-info">'+(project?esc(partnerLabel(projects[project].partners)):'')+'</p></div><fieldset class="ff-partner-picks ff-checks" id="ff-partner-picks" '+(inherit?'hidden disabled':'')+'><legend class="ff-sr">Verantwortliche Partner</legend>'+partnerChecks(selected)+'</fieldset>';
    }
    function deputyOptions(selected){
      return '<option value="">Keine Vertretung</option>'+[['Assistenz',assistantIds],['Anwälte',lawyerIds]].map(([label,ids])=>'<optgroup label="'+label+'">'+ids.filter(id=>id!==user()).map(id=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+esc(pname(id))+'</option>').join('')+'</optgroup>').join('');
    }
    function settingsView(){
      let fields='<p class="ff-muted ff-small" style="margin-bottom:24px">'+esc(pname(user()))+'</p><label class="ff-field"><span>Personenanzeige</span><select name="nameDisplay"><option value="initials" '+(userSettings[user()].nameDisplay==='initials'?'selected':'')+'>Kürzel</option><option value="full" '+(userSettings[user()].nameDisplay==='full'?'selected':'')+'>Volle Namen</option></select></label>';
      if(state.role==='assistant'){
        const settings=assistantSettings[user()],coverage=settings.coverage;
        fields+='<section class="ff-settings-section"><h2>Betreute Anwälte</h2><fieldset class="ff-partner-picks ff-checks"><legend class="ff-sr">Anwälte für meine Übersicht</legend>'+personChecks(lawyerIds,settings.lawyers,'supportedLawyers')+'</fieldset></section>'
          +'<section class="ff-settings-section"><h2>Meine Vertretung</h2><label class="ff-field"><span>Vertretung durch</span><select name="deputy" id="ff-settings-deputy">'+deputyOptions(coverage?.deputy)+'</select></label><div class="ff-formgrid" id="ff-coverage-period" '+(!coverage?'hidden':'')+'><label class="ff-field"><span>Von</span><input type="date" name="coverFrom" id="ff-cover-from" value="'+(coverage?.from||'')+'" '+(coverage?'required':'disabled')+'></label><label class="ff-field"><span>Bis (einschließlich)</span><input type="date" name="coverUntil" id="ff-cover-until" value="'+(coverage?.until||'')+'" '+(coverage?'required':'disabled')+'></label></div></section>';
      }
      fields+='<label class="ff-field"><span>Maximale Balkenspanne in Wochen</span><input type="number" name="weeks" min="1" step="1" value="'+spanWeeks()+'" required></label><span class="ff-muted ff-small">Standard: 6 Wochen</span>';
      return formFrame('Einstellungen',fields,'Speichern');
    }
    function movePartnersText(d,project){
      const useTarget=project&&project!==d.project;
      const ids=useTarget?projects[project].partners:effectivePartners(d);
      return partnerLabel(ids)+(project&&(useTarget||inherits(d))?' · vom Projekt':'');
    }
    function editView(){
      const d=get(state.detail);
      if(state.edit==='project')return formFrame('Projektzuordnung ändern','<p class="ff-muted ff-small" style="margin-bottom:24px">'+esc(d.title)+'</p><label class="ff-field"><span>Zuordnung</span><select name="project" id="ff-project-target">'+projectOptions(d.project)+'</select></label><p class="ff-partner-source" id="ff-move-partners">'+esc(movePartnersText(d,d.project))+'</p>','Verschieben');
      if(state.edit==='partners')return formFrame('Partner der Frist','<p class="ff-muted ff-small" style="margin-bottom:24px">'+esc(d.title)+'</p>'+partnerFields(d.project,effectivePartners(d),inherits(d)),'Speichern');
      if(state.edit==='assign')return formFrame('Zuständigkeit ändern','<fieldset class="ff-partner-picks ff-checks"><legend class="ff-sr">Zuständige Personen</legend>'+personChecks(lawyerIds,d.assignees,'assignees')+'</fieldset>','Speichern');
      if(state.edit==='kind')return formFrame('Kennzeichnung ändern',kindFields(d.kind,d.notfrist),'Speichern');
      if(state.edit==='preliminary')return formFrame('Interne Vorfrist','<p class="ff-muted ff-small" style="margin-bottom:24px">'+esc(d.title)+' · Ablauf '+esc(dueLabel(d))+'</p><label class="ff-field"><span>Vorfristdatum</span><input type="date" name="day" id="ff-preliminary-day" max="'+dayAfter(d.day,-1)+'" value="'+esc(state.preliminaryDraft)+'" required></label><div id="ff-preliminary-preview">'+preliminaryTimeline(d)+'</div>'+(d.preliminary?'<button type="button" class="ff-text-action" data-remove-preliminary style="margin-top:20px">Vorfrist entfernen</button>':''),'Vorfrist speichern');
      if(state.edit==='date')return formFrame('Fristdatum ändern','<div class="ff-formgrid"><label class="ff-field"><span>Datum</span><input type="date" name="day" value="'+d.day+'" required></label><label class="ff-field"><span>Uhrzeit (optional) · Berlin</span><input type="time" name="time" value="'+(d.time==='day'?'':d.time)+'"></label></div><label class="ff-field"><span>Grund</span><input name="reason" required></label>'+(d.parent?'<p class="ff-muted ff-small">Bezugsfrist: '+esc(dueLabel(get(d.parent)))+'</p>':''),'Datum ändern');
      if(state.edit==='verify')return formFrame('Erledigung kontrollieren','<p style="margin-bottom:22px">'+esc(d.evidence)+'</p><label class="ff-check"><input type="checkbox" name="checked" required>Fristwahrung anhand der Nachweise kontrolliert</label>','Kontrolle bestätigen');
      return formFrame(d.kind==='internal'?'Interne Frist abschließen':'Erledigung melden','<label class="ff-field"><span>'+(d.kind==='internal'?'Bearbeitungsvermerk':'Erledigungsvermerk / Verweis auf Eingangskontrolle')+'</span><textarea rows="3" name="evidence" required></textarea></label>'+(d.kind!=='internal'?'<p class="ff-muted ff-small">Die Frist bleibt bis zur bestätigten Erledigungskontrolle offen.</p>':''),d.kind==='internal'?'Abschließen':'Zur Kontrolle vorlegen');
    }
    function projectEditorView(){
      const creating=state.view==='project-new',p=creating?{name:'',partners:[partnerIds.includes(user())?user():'felix']}:projects[state.projectEdit];
      if(!creating&&!mayEditProject(state.projectEdit))return '<div class="ff-detail"><h1>'+esc(p.name)+'</h1><p class="ff-partner-note">'+esc(partnerLabel(p.partners))+'</p></div>';
      if(state.projectDeleteStage)return projectDeleteView();
      return formFrame(creating?'Projekt anlegen':'Projekt bearbeiten','<label class="ff-field"><span>Projektname</span><input name="projectName" value="'+esc(p.name)+'" required autocomplete="off"></label><div class="ff-fieldgroup"><span class="ff-keylabel">Partner</span><fieldset class="ff-partner-picks ff-checks"><legend class="ff-sr">Verantwortliche Partner</legend>'+partnerChecks(p.partners)+'</fieldset></div><p class="ff-partner-source">Gilt für alle Fristen mit Partnerübernahme vom Projekt.</p>',creating?'Projekt anlegen':'Speichern')+(creating?'':'<div class="ff-detail ff-form ff-project-delete-action"><button type="button" class="ff-text-action ff-danger-text" data-delete-project>Projekt löschen</button></div>');
    }
    function projectDeletionInfo(id){return planProjectDeletion(currentData(),id);}
    const deletionSignature=info=>info.open.map(d=>d.id).sort().join('|');
    const deletionLabel=info=>state.projectDeleteStage==='warn'?'Projekt und Fristen löschen':state.projectDeleteMode==='keep'?'Projekt löschen':info.open.length?'Weiter':'Projekt und Fristen löschen';
    function projectDeleteView(){
      const p=projects[state.projectEdit],info=projectDeletionInfo(state.projectEdit),total=info.members.length,active=info.open.length;
      let body='<div class="ff-delete-summary"><strong>'+esc(p.name)+'</strong><p class="ff-sub">'+total+' '+(total===1?'Frist':'Fristen')+', davon '+active+' offen. Die Auswahl gilt für das gesamte Projekt.</p></div>';
      if(state.projectDeleteStage==='warn'){
        body+='<div class="ff-delete-warning" role="alert">'+icon('triangle-alert')+'<span><strong>'+active+' '+(active===1?'Frist ist':'Fristen sind')+' noch nicht erledigt.</strong><br>Mit dem Projekt werden auch diese offenen Fristen gelöscht.</span></div><ul class="ff-steps ff-delete-open">'+info.open.map(d=>'<li class="ff-step"><span>'+esc(d.title)+' <span class="ff-muted ff-small">('+esc(matters[d.matter].code)+')</span>'+(d.status==='Erledigungskontrolle offen'?'<span class="ff-sub">Erledigung noch nicht bestätigt</span>':'')+'</span><span class="ff-step-date '+(d.day<=today?'ff-today':'')+'">'+esc(dueLabel(d))+'</span></li>').join('')+'</ul><label class="ff-check"><input type="checkbox" name="confirmOpen" required><span>Auch die noch offenen Fristen löschen</span></label>';
      }else if(total){
        body+='<fieldset class="ff-partner-picks ff-delete-choices"><legend>Was soll mit den Fristen geschehen?</legend><label class="ff-check"><input type="radio" name="deletionMode" value="keep" '+(state.projectDeleteMode==='keep'?'checked':'')+' required><span>Fristen behalten<span class="ff-sub">Die Fristen werden eigenständige Einträge. Zuständigkeiten und Partner bleiben erhalten.</span></span></label><label class="ff-check"><input type="radio" name="deletionMode" value="all" '+(state.projectDeleteMode==='all'?'checked':'')+' required><span>Alle Fristen mitlöschen<span class="ff-sub">Gilt auch für bereits erledigte und in dieser Ansicht ausgeblendete Fristen.</span></span></label></fieldset>';
      }else body+='<p>Das Projekt enthält keine Fristen.</p>';
      if(info.external.length)body+='<p class="ff-sub" style="margin-top:16px">'+info.external.length+' verknüpfte '+(info.external.length===1?'Frist außerhalb dieses Projekts bleibt':'Fristen außerhalb dieses Projekts bleiben')+' erhalten. Beim Mitlöschen entfällt die Verknüpfung zur gelöschten Bezugsfrist.</p>';
      return formFrame(state.projectDeleteStage==='warn'?'Offene Fristen mitlöschen?':'Projekt löschen',body,deletionLabel(info),state.projectDeleteStage==='warn'||state.projectDeleteMode==='keep'||!active);
    }
    function removeProject(id,withDeadlines){
      let result;
      try {
        result=deleteProject(currentData(),id,{userId:user(),deleteDeadlines:withDeadlines,
          confirmedOpenIds:state.projectDeleteReviewed?state.projectDeleteReviewed.split('|'):[],
          historyPrefix:historyStamp()+' · '+personRef(user())});
      } catch (cause) { error(cause.message);return; }
      for(const selected of Object.values(subscriptions))for(const deadline of result.deletedIds)selected.delete(deadline);
      state.collapsed.delete(id);navigate('deadlines');
      notice(withDeadlines?'Projekt und '+result.deletedIds.length+' Fristen gelöscht.':'Projekt gelöscht. '+result.retainedCount+' Fristen als eigenständige Einträge erhalten.');
    }
    function matterOptions(selected){return Object.entries(matters).map(([id,m])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+esc(m.code)+' · '+esc(m.name)+'</option>').join('')+'<option value="__new__" '+(selected==='__new__'?'selected':'')+'>Neues Verfahren anlegen …</option>';}
    function linkedOptions(matter,selected){return '<option value="">Keine Zuordnung</option>'+items.filter(d=>d.matter===matter&&d.kind!=='internal'&&d.status!=='Erledigt').map(d=>'<option value="'+d.id+'" '+(d.id===selected?'selected':'')+'>'+esc(d.title)+' · '+esc(dueLabel(d))+'</option>').join('');}
    function newView(){
      const parent=state.newParent?get(state.newParent):null,project=parent?.project||'',matter=parent?.matter||'m3';
      const kind=parent||state.role==='lawyer'?'internal':'pleading';
      const assigned=parent?.assignees||(lawyerIds.includes(user())?[user()]:['felix']);
      const partners=project?projects[project].partners:(parent?effectivePartners(parent):[partnerIds.includes(user())?user():'felix']);
      const fields='<label class="ff-field"><span>Bezeichnung</span><input name="title" value="'+esc(parent?'Interne Frist · '+parent.title:'')+'" required autocomplete="off"></label>'
        +'<label class="ff-field"><span>Projekt</span><select name="project" id="ff-new-project">'+projectOptions(project)+'</select></label>'
        +'<label class="ff-field"><span>Verfahren</span><select name="matter" id="ff-new-matter">'+matterOptions(matter)+'</select></label><div id="ff-new-matter-fields" hidden><label class="ff-field"><span>Aktenzeichen</span><input name="matterCode" disabled></label><label class="ff-field"><span>Verfahrensbezeichnung</span><input name="matterName" disabled></label></div>'+kindFields(kind)
        +'<label class="ff-field" id="ff-new-parent-field" '+(kind!=='internal'?'hidden':'')+'><span>Bezugsfrist (optional)</span><select name="parent" id="ff-new-parent" '+(kind!=='internal'?'disabled':'')+'>'+linkedOptions(matter,parent?.id)+'</select></label>'
        +'<div class="ff-formgrid"><label class="ff-field"><span>Datum</span><input type="date" name="day" required></label><label class="ff-field"><span>Uhrzeit (optional) · Berlin</span><input type="time" name="time"></label></div>'
        +'<div class="ff-fieldgroup"><span class="ff-keylabel">Zuständigkeit</span><fieldset class="ff-partner-picks ff-checks"><legend class="ff-sr">Zuständige Personen</legend>'+personChecks(lawyerIds,assigned,'assignees')+'</fieldset></div>'
        +'<div class="ff-fieldgroup"><span class="ff-keylabel">Partner</span>'+partnerFields(project,partners,!!project)+'</div>'
        +'<label class="ff-field"><span>Anlass / Grundlage</span><input name="source" required></label>';
      return formFrame(parent?'Interne Frist hinzufügen':state.role==='lawyer'?'Frist ergänzen':'Frist erfassen',fields,'Eintrag anlegen');
    }
    let persistenceError='';
    function currentData(){return {schemaVersion:1,activeUser:state.user,nextDeadlineId,people,projects,matters,items,userSettings,assistantSettings,subscriptions:Object.fromEntries(Object.entries(subscriptions).map(([id,values])=>[id,[...values]]))};}
    function persist(){
      try { repository.save(currentData());persistenceError=''; }
      catch (cause) { persistenceError='Nicht gespeichert: '+cause.message; }
    }
    function render({refreshList=false}={}){
      now=Date.now();today=todayInBerlin(now);
      root.querySelector('#ff-nav').innerHTML='<button type="button" data-nav="deadlines" aria-current="page">Fristen</button>';
      root.querySelector('#ff-avatar').textContent=people[user()].initials;
      root.querySelector('#ff-profile-name').textContent=pname(user());
      root.querySelector('#ff-profile-name').hidden=userSettings[user()].nameDisplay!=='full';
      root.querySelector('#ff-profile-users').innerHTML=['clara','sophie','till','lena','jonas','felix','mara'].map(id=>'<button type="button" data-user="'+id+'">'+esc(pname(id))+' · '+({assistant:'Assistenz',lawyer:'Anwalt',partner:'Partner'}[people[id].role])+'</button>').join('');
      const modalMarkup=state.view==='settings'?settingsView():state.view==='new'?newView():state.view==='project-new'||state.projectEdit?projectEditorView():state.edit?editView():state.detail?detailView():null;
      const modalKey=[state.view,state.projectEdit,state.projectDeleteStage,state.detail,state.edit].join(':');
      if(modalMarkup)dialog.update(modalMarkup,modalKey);
      const listKey=state.scope+'|'+JSON.stringify(currentData());
      if(refreshList||listKey!==renderedList){content.innerHTML=listView();renderedList=listKey;}
      if(!modalMarkup)dialog.update(null,modalKey);
      dialog.notice.textContent='';
      root.querySelector('#ff-clock').textContent=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}).format(now)+' · Berlin';
      for(const element of root.querySelectorAll('[data-tooltip]'))element.setAttribute('title',element.dataset.tooltip);
      lucide.createIcons();
      persist();if(persistenceError)notice(persistenceError);
    }
    function navigate(view){state.view=view;state.detail=null;state.edit=null;state.projectEdit=null;state.projectDeleteStage=null;state.projectDeleteMode='keep';state.projectDeleteReviewed='';live.textContent='';render();}
    function open(id){if(!get(id))return;state.detail=id;state.edit=null;state.projectEdit=null;state.projectDeleteStage=null;live.textContent='';render();}
    function notice(text){const target=dialog.element.open?dialog.notice:live;target.textContent=persistenceError||text;}
    function error(text){root.querySelector('#ff-error').textContent=text;}
    function pickPreliminary(d,button,event){
      const track=button.querySelector('.ff-meter-track');
      const rect=track?.getBoundingClientRect();
      return event.detail!==0&&rect?.width?preliminaryDayAt(d,(event.clientX-rect.left)/rect.width):(d.preliminary?.day||'');
    }
    root.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||!root.contains(b))return;
      if(b.dataset.user){if(!Object.prototype.hasOwnProperty.call(people,b.dataset.user))return;state.user=b.dataset.user;state.role=people[state.user].role;state.scope=state.role==='partner'?'responsibility':'mine';root.querySelector('#ff-profile').open=false;navigate('deadlines');return;}
      if(b.hasAttribute('data-settings')){root.querySelector('#ff-profile').open=false;navigate('settings');return;}
      if(b.dataset.nav){navigate(b.dataset.nav);return;}
      if(b.dataset.scope){
        if(!['mine','all',...lawyerIds,...(state.role==='partner'?['responsibility']:[])].includes(b.dataset.scope))return;
        state.scope=b.dataset.scope;render();return;
      }
      if(b.dataset.subscribe){
        e.preventDefault();e.stopPropagation();
        const d=get(b.dataset.subscribe);if(!d||d.status==='Erledigt')return;
        const subscribed=isSubscribed(d);
        if(!subscribed&&inOverview(d,user()))return;
        if(subscribed)subscriptions[user()].delete(d.id);else subscriptions[user()].add(d.id);
        render();
        notice(subscribed?(inOverview(d,user())?'Abonnement beendet. Die Frist bleibt aufgrund ihrer Zuordnung in Meine Fristen.':'Abonnement beendet.'):'Frist zu Meine Fristen hinzugefügt.');
        const focusTarget=dialog.element.open?dialog.element.querySelector('[data-subscribe="'+d.id+'"]')||root.querySelector('#ff-dialog-title'):content.querySelector('[data-subscribe="'+d.id+'"]')||root.querySelector('#ff-scope > summary');
        focusTarget?.focus({preventScroll:true});
        return;
      }
      if(b.dataset.projectOpen||b.dataset.projectPartners){
        e.preventDefault();e.stopPropagation();
        const id=b.dataset.projectOpen||b.dataset.projectPartners;if(!projects[id])return;
        state.projectEdit=id;state.projectDeleteStage=null;state.projectDeleteMode='keep';state.projectDeleteReviewed='';state.detail=null;state.edit=null;live.textContent='';render();return;
      }
      if(b.hasAttribute('data-delete-project')){
        if(!mayEditProject(state.projectEdit))return;
        state.projectDeleteStage='choose';state.projectDeleteMode='keep';state.projectDeleteReviewed='';live.textContent='';render();return;
      }
      if(b.hasAttribute('data-project-create')){navigate('project-new');return;}
      if(b.dataset.open){
        const d=get(b.dataset.open);
        if(d&&e.target.closest('.ff-meter-row')&&mayEdit(d)){
          state.preliminaryDraft=pickPreliminary(d,b,e);state.detail=d.id;state.projectEdit=null;state.edit='preliminary';live.textContent='';render();return;
        }
        open(b.dataset.open);return;
      }
      if(b.dataset.edit){if(!mayEdit(get(state.detail)))return;state.edit=b.dataset.edit;if(state.edit==='preliminary')state.preliminaryDraft=get(state.detail).preliminary?.day||'';live.textContent='';render();return;}
      if(b.hasAttribute('data-preliminary-timeline')){
        if(state.edit!=='preliminary'||!mayEdit(get(state.detail)))return;
        const input=root.querySelector('#ff-preliminary-day');
        if(e.detail===0){input.focus();try{input.showPicker?.();}catch{}return;}
        state.preliminaryDraft=pickPreliminary(get(state.detail),b,e);input.value=state.preliminaryDraft;syncPreliminaryTimeline();return;
      }
      if(b.hasAttribute('data-remove-preliminary')){
        const d=get(state.detail);if(state.edit!=='preliminary'||!mayEdit(d)||!d.preliminary)return;
        delete d.preliminary;d.history.unshift(historyStamp()+' · '+personRef(user())+': Interne Vorfrist entfernt.');state.preliminaryDraft='';state.edit=null;render();notice('Vorfrist entfernt.');return;
      }
      if(b.hasAttribute('data-preliminary-done')){
        const d=get(state.detail);if(!mayEdit(d)||!d.preliminary||d.status==='Erledigt')return;
        d.preliminary.done=!d.preliminary.done;
        d.history.unshift(historyStamp()+' · '+personRef(user())+': Interne Vorfrist '+(d.preliminary.done?'als erledigt markiert.':'wieder geöffnet.'));
        render();notice(d.preliminary.done?'Vorfrist erledigt.':'Vorfrist wieder geöffnet.');return;
      }
      if(b.hasAttribute('data-cancel')){
        if(state.projectDeleteStage){state.projectDeleteStage=state.projectDeleteStage==='warn'?'choose':null;state.projectDeleteReviewed='';live.textContent='';render();return;}
        if(state.view==='settings'||state.view==='project-new'){navigate('deadlines');return;}
        if(state.view==='new'){state.view='deadlines';state.detail=state.newParent;state.newParent=null;}
        state.projectEdit=null;state.edit=null;render();return;
      }
      if(b.hasAttribute('data-new')){state.newParent=null;navigate('new');return;}
      if(b.hasAttribute('data-add-internal')){state.newParent=state.detail;navigate('new');}
    });
    root.addEventListener('submit',e=>{
      if(e.target.id!=='ff-form')return;e.preventDefault();now=Date.now();today=todayInBerlin(now);const fd=new FormData(e.target);
      if(state.view==='settings'){
        const weeks=Number(fd.get('weeks'));
        if(!Number.isSafeInteger(weeks)||weeks<1)return error('Bitte eine positive, ganze Wochenzahl eingeben.');
        const nameDisplay=String(fd.get('nameDisplay')||userSettings[user()].nameDisplay);
        if(!['initials','full'].includes(nameDisplay))return error('Bitte Kürzel oder volle Namen auswählen.');
        if(state.role==='assistant'){
          const lawyers=[...new Set(fd.getAll('supportedLawyers'))],deputy=String(fd.get('deputy')||'');
          if(!lawyers.every(id=>lawyerIds.includes(id)))return error('Bitte Anwälte aus der Liste auswählen.');
          let coverage=null;
          if(deputy){
            if(deputy===user()||!Object.prototype.hasOwnProperty.call(people,deputy))return error('Bitte eine andere Person als Vertretung auswählen.');
            const from=String(fd.get('coverFrom')||''),until=String(fd.get('coverUntil')||'');
            if(!validDay(from)||!validDay(until))return error('Bitte Beginn und Ende der Vertretung vollständig angeben.');
            if(from>until)return error('Das Ende der Vertretung darf nicht vor dem Beginn liegen.');
            coverage={deputy,from,until};
          }
          assistantSettings[user()]={lawyers,coverage};
        }
        userSettings[user()].weeks=weeks;userSettings[user()].nameDisplay=nameDisplay;navigate('deadlines');notice('Persönliche Einstellungen gespeichert.');return;
      }
      if(state.view==='project-new'){
        const name=String(fd.get('projectName')||'').trim(),selected=[...new Set(fd.getAll('partners'))];
        if(!name)return error('Bitte einen Projektnamen eingeben.');
        if(!validSelection(selected,partnerIds))return error('Bitte mindestens einen Partner auswählen.');
        const id='p'+crypto.randomUUID();projects[id]={name,partners:selected,createdBy:user(),history:[historyStamp()+' · '+personRef(user())+': Projekt angelegt.']};
        state.scope='all';navigate('deadlines');notice('Projekt „'+name+'“ angelegt.');return;
      }
      if(state.projectEdit){
        const id=state.projectEdit;if(!mayEditProject(id))return;
        if(state.projectDeleteStage){
          const info=projectDeletionInfo(id);
          const mode=state.projectDeleteStage==='warn'?'all':info.members.length?String(fd.get('deletionMode')||''):'keep';
          if(!['keep','all'].includes(mode))return error('Bitte auswählen, was mit den Fristen geschehen soll.');
          state.projectDeleteMode=mode;
          if(mode==='all'&&info.open.length){
            if(state.projectDeleteStage!=='warn'||state.projectDeleteReviewed!==deletionSignature(info)){
              state.projectDeleteStage='warn';state.projectDeleteReviewed=deletionSignature(info);render();return;
            }
            if(!fd.get('confirmOpen'))return error('Bitte das Mitlöschen der noch offenen Fristen ausdrücklich bestätigen.');
          }
          removeProject(id,mode==='all');return;
        }
        const name=String(fd.get('projectName')||'').trim();
        if(!name)return error('Bitte einen Projektnamen eingeben.');
        const selected=[...new Set(fd.getAll('partners'))];
        if(!validSelection(selected,partnerIds))return error('Bitte mindestens einen Partner auswählen.');
        const p=projects[id];
        if(p.name!==name){p.history.unshift(historyStamp()+' · '+personRef(user())+': Projekt umbenannt von „'+p.name+'“ in „'+name+'“.');p.name=name;}
        if(JSON.stringify(p.partners)!==JSON.stringify(selected)){
          p.partners=selected;p.history.unshift(historyStamp()+' · '+personRef(user())+': Partner geändert: '+partnerRefs(selected)+'.');
        }
        state.collapsed.delete(id);navigate('deadlines');notice('Projekt „'+p.name+'“ gespeichert.');return;
      }
      if(state.view==='new'){
        const type=typeFrom(fd),project=String(fd.get('project')||'');
        if(!type)return error('Bitte eine Kennzeichnung aus der Liste auswählen.');
        const {kind,notfrist}=type;
        if(project&&!Object.prototype.hasOwnProperty.call(projects,project))return error('Bitte ein vorhandenes Projekt oder „Ohne Projekt“ auswählen.');
        const assignees=[...new Set(fd.getAll('assignees'))],partners=project&&fd.get('inherit')?null:[...new Set(fd.getAll('partners'))];
        if(!validSelection(assignees,lawyerIds))return error('Bitte mindestens eine zuständige Person auswählen.');
        if(partners!==null&&!validSelection(partners,partnerIds))return error('Bitte mindestens einen Partner auswählen.');
        const creatingMatter=fd.get('matter')==='__new__',matterCode=String(fd.get('matterCode')||'').trim(),matterName=String(fd.get('matterName')||'').trim();
        if(creatingMatter&&(!matterCode||!matterName))return error('Bitte Aktenzeichen und Verfahrensbezeichnung ergänzen.');
        const d={id:'f'+nextDeadlineId,title:String(fd.get('title')||'').trim(),matter:creatingMatter?'m'+crypto.randomUUID():fd.get('matter'),project:project||null,kind,notfrist,day:fd.get('day'),time:fd.get('time')||'day',assignees,partners,status:'Offen',verified:['internal','urgency'].includes(kind),calendar:'Abgleich ausstehend',source:String(fd.get('source')||'').trim(),history:[historyStamp()+' · '+personRef(user())+': Frist manuell angelegt.']};
        if(kind==='internal'&&fd.get('parent'))d.parent=fd.get('parent');
        if(!d.title||!d.source)return error('Bitte Bezeichnung und Grundlage ergänzen.');
        if(!creatingMatter&&!matters[d.matter])return error('Bitte ein Verfahren auswählen.');
        if(!validDay(d.day)||!Number.isFinite(end(d))||end(d)<=now)return error('Bitte ein zukünftiges Datum für den Beispieleintrag wählen.');
        if(d.parent){const reference=get(d.parent);if(!reference||reference.kind==='internal'||reference.matter!==d.matter)return error('Bitte eine Bezugsfrist aus demselben Verfahren auswählen.');if(end(d)>=end(reference))return error('Die interne Frist muss vor der Bezugsfrist liegen.');}
        if(creatingMatter)matters[d.matter]={name:matterName,short:matterName,code:matterCode,court:'',project:project||null};
        items.push(d);nextDeadlineId++;state.view='deadlines';state.detail=d.id;state.scope='all';state.newParent=null;render();notice('Frist angelegt.');return;
      }
      const d=get(state.detail);if(!mayEdit(d))return;
      if(state.edit==='project'){
        const project=String(fd.get('project')||'');
        if(project&&!Object.prototype.hasOwnProperty.call(projects,project))return error('Bitte ein vorhandenes Projekt oder „Ohne Projekt“ auswählen.');
        const next=project||null;if(next===d.project){state.edit=null;render();return;}
        const previous=projectLabel(d.project),partners=[...effectivePartners(d)];
        d.project=next;d.partners=next?null:partners;
        d.history.unshift(historyStamp()+' · '+personRef(user())+': Projektzuordnung geändert: '+previous+' → '+projectLabel(next)+'. Partner: '+partnerRefs(effectivePartners(d))+'.');
        if(next)state.collapsed.delete(next);state.edit=null;render();notice('„'+d.title+'“ '+(next?'in „'+projects[next].name+'“ verschoben.':'als eigenständige Frist herausgelöst.'));return;
      }
      if(state.edit==='partners'){
        const selected=d.project&&fd.get('inherit')?null:[...new Set(fd.getAll('partners'))];
        if(selected!==null&&!validSelection(selected,partnerIds))return error('Bitte mindestens einen Partner auswählen.');
        if(JSON.stringify(d.partners)!==JSON.stringify(selected)){
          d.partners=selected;d.history.unshift(historyStamp()+' · '+personRef(user())+': Partner '+(inherits(d)?'vom Projekt übernommen: ':'individuell zugeordnet: ')+partnerRefs(effectivePartners(d))+'.');
        }
        state.edit=null;render();notice('Partnerzuordnung gespeichert.');return;
      }
      if(state.edit==='assign'){
        const selected=[...new Set(fd.getAll('assignees'))];if(!validSelection(selected,lawyerIds))return error('Bitte mindestens eine zuständige Person auswählen.');
        if(JSON.stringify(d.assignees)!==JSON.stringify(selected)){d.assignees=selected;d.calendar='Abgleich ausstehend';d.history.unshift(historyStamp()+' · '+personRef(user())+': Zuständigkeit geändert: '+personRefs(selected)+'.');}
        state.edit=null;render();notice('Zuständigkeit gespeichert.');return;
      }
      if(state.edit==='kind'){
        const type=typeFrom(fd);if(!type)return error('Bitte eine Kennzeichnung aus der Liste auswählen.');
        const {kind,notfrist}=type;
        if(d.kind!==kind||d.notfrist!==notfrist){d.kind=kind;d.notfrist=notfrist;d.verified=['internal','urgency'].includes(kind);d.calendar='Abgleich ausstehend';d.history.unshift(historyStamp()+' · '+personRef(user())+': Kennzeichnung geändert: '+kindLabel(d)+'.');}
        state.edit=null;render();notice('Kennzeichnung gespeichert.');return;
      }
      if(state.edit==='preliminary'){
        const day=String(fd.get('day')||'');
        if(!validDay(day))return error('Bitte ein gültiges Vorfristdatum angeben.');
        if(day>=d.day)return error('Die interne Vorfrist muss vor dem Ablaufdatum liegen.');
        if(d.preliminary?.day!==day){d.preliminary={day,done:false};d.history.unshift(historyStamp()+' · '+personRef(user())+': Interne Vorfrist auf '+date(day)+' gesetzt.');}
        state.preliminaryDraft='';state.edit=null;render();notice('Interne Vorfrist gespeichert.');return;
      }
      if(state.edit==='date'){
        if(state.role==='lawyer'&&!['internal','urgency'].includes(d.kind))return;
        const candidate={...d,day:fd.get('day'),time:fd.get('time')||'day'},reason=String(fd.get('reason')||'').trim();
        if(!reason)return error('Bitte den Grund ergänzen.');
        if(!validDay(candidate.day)||!Number.isFinite(end(candidate))||end(candidate)<=now)return error('Bitte ein zukünftiges Datum wählen.');
        if(d.preliminary&&candidate.day<=d.preliminary.day)return error('Das Ablaufdatum muss nach der internen Vorfrist liegen.');
        if(d.kind==='internal'&&d.parent&&end(candidate)>=end(get(d.parent)))return error('Die interne Frist muss vor der Bezugsfrist liegen.');
        d.day=candidate.day;d.time=candidate.time;d.calendar='Abgleich ausstehend';d.history.unshift(historyStamp()+' · '+personRef(user())+': Fristdatum geändert: '+reason);state.edit=null;render();notice('Fristdatum geändert.');return;
      }
      if(state.edit==='verify'){
        if(state.role==='lawyer'||!fd.get('checked')||!d.evidence)return;
        d.status='Erledigt';d.history.unshift(historyStamp()+' · '+personRef(user())+': Erledigung kontrolliert.');
      }else if(state.edit==='complete'){
        const evidence=String(fd.get('evidence')||'').trim();if(!evidence)return error('Bitte den Vermerk ergänzen.');
        d.evidence=evidence;d.status=d.kind==='internal'?'Erledigt':'Erledigungskontrolle offen';d.history.unshift(historyStamp()+' · '+personRef(user())+': '+(d.kind==='internal'?'Interne Frist abgeschlossen.':'Erledigung gemeldet.'));
      }else return;
      state.edit=null;render();notice(d.status==='Erledigt'?'Abschluss im Entwurf vermerkt.':'Erledigung gemeldet. Die Frist bleibt bis zur Kontrolle offen.');
    });
    root.addEventListener('change',e=>{
      if(e.target.name==='deletionMode'&&state.projectDeleteStage==='choose'){
        if(!['keep','all'].includes(e.target.value))return;
        state.projectDeleteMode=e.target.value;state.projectDeleteReviewed='';
        const info=projectDeletionInfo(state.projectEdit),button=root.querySelector('#ff-submit');button.textContent=deletionLabel(info);button.classList.toggle('ff-danger',state.projectDeleteMode==='keep'||!info.open.length);return;
      }
      if(e.target.id==='ff-settings-deputy'){
        const enabled=!!e.target.value;root.querySelector('#ff-coverage-period').hidden=!enabled;
        for(const selector of ['#ff-cover-from','#ff-cover-until']){const field=root.querySelector(selector);field.disabled=!enabled;field.required=enabled;}
      }
      if(e.target.id==='ff-flag'){
        const plain=e.target.value==='none',internal=root.querySelector('#ff-internal');root.querySelector('#ff-internal-field').hidden=!plain;internal.disabled=!plain;if(!plain)internal.checked=false;
        if(state.view==='new'){const linked=plain&&internal.checked;root.querySelector('#ff-new-parent-field').hidden=!linked;root.querySelector('#ff-new-parent').disabled=!linked;}
      }
      if(e.target.id==='ff-internal'&&state.view==='new'){
        root.querySelector('#ff-new-parent-field').hidden=!e.target.checked;root.querySelector('#ff-new-parent').disabled=!e.target.checked;
      }
      if(e.target.id==='ff-preliminary-day'&&state.edit==='preliminary'){
        state.preliminaryDraft=validDay(e.target.value)&&e.target.value<get(state.detail).day?e.target.value:'';syncPreliminaryTimeline();
      }
      if(e.target.id==='ff-new-matter'){
        root.querySelector('#ff-new-parent').innerHTML=linkedOptions(e.target.value);
        const creating=e.target.value==='__new__',fields=root.querySelector('#ff-new-matter-fields');fields.hidden=!creating;
        for(const field of fields.querySelectorAll('input')){field.disabled=!creating;field.required=creating;}
      }
      if(e.target.id==='ff-new-project'){
        const project=e.target.value,inherit=!!project;
        root.querySelector('#ff-inherit-wrap').hidden=!inherit;
        root.querySelector('#ff-inherit').disabled=!inherit;root.querySelector('#ff-inherit').checked=inherit;
        root.querySelector('#ff-inherit-info').textContent=project?partnerLabel(projects[project].partners):'';
        const picks=root.querySelector('#ff-partner-picks');picks.innerHTML=partnerChecks(project?projects[project].partners:[partnerIds.includes(user())?user():'felix']);picks.disabled=inherit;picks.hidden=inherit;
      }
      if(e.target.id==='ff-inherit'){const picks=root.querySelector('#ff-partner-picks');picks.disabled=e.target.checked;picks.hidden=e.target.checked;}
      if(e.target.id==='ff-project-target')root.querySelector('#ff-move-partners').textContent=movePartnersText(get(state.detail),e.target.value||null);
    });
    root.addEventListener('toggle',e=>{const project=e.target.dataset?.projectId;if(project&&root.contains(e.target)){if(e.target.open)state.collapsed.delete(project);else state.collapsed.add(project);}},true);
    root.addEventListener('keydown',e=>{if(e.key==='Escape')root.querySelectorAll('.ff-menu[open]').forEach(el=>el.open=false);});
    render();
    const clockTimer=setInterval(()=>{
      now=Date.now();today=todayInBerlin(now);
      if(state.view==='deadlines'&&!state.detail&&!state.edit&&!state.projectEdit)render({refreshList:true});
    },60000);
    return ()=>clearInterval(clockTimer);
}
