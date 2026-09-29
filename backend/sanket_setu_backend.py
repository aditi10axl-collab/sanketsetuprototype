from pathlib import Path
import base64,pickle,re
import cv2,numpy as np
from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from sklearn.ensemble import RandomForestClassifier
from app.orchestrator import orchestrate
ROOT=Path(__file__).resolve().parents[1]; M=ROOT/'models'; M.mkdir(exist_ok=True); DATA=M/'custom_calibration.pkl'; MODEL=M/'custom.pkl'; HAND=M/'hand_landmarker.task'; N=32; F=168; MAX=10; TH=.50
app=FastAPI(title='Sanket Setu AI',version='5.0');app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_credentials=False,allow_methods=['*'],allow_headers=['*'])
landmarker=None;model=None;classes=[]
class Img(BaseModel): image_base64:str
class Seq(BaseModel): sequence:list[list[float]]
class Cal(BaseModel): label:str;sequence:list[list[float]]
class Proc(BaseModel): input_type:str;input:str;confidence:float|None=None

def load():
 global model,classes
 if MODEL.exists():
  d=pickle.load(open(MODEL,'rb'));model=d.get('model',d) if isinstance(d,dict) else d;classes=list(d.get('classes',getattr(model,'classes_',[]))) if isinstance(d,dict) else list(getattr(model,'classes_',[]))
def init():
 global landmarker
 if not HAND.exists(): return
 o=vision.HandLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(HAND)),running_mode=vision.RunningMode.IMAGE,num_hands=2,min_hand_detection_confidence=.5,min_hand_presence_confidence=.5,min_tracking_confidence=.5);landmarker=vision.HandLandmarker.create_from_options(o)
@app.on_event('startup')
def startup(): load();init()
def img(s):
 if ',' in s:s=s.split(',',1)[1]
 a=np.frombuffer(base64.b64decode(s),np.uint8);x=cv2.imdecode(a,cv2.IMREAD_COLOR)
 if x is None:raise HTTPException(400,'Invalid image')
 return x
def feat(x):
 if landmarker is None:raise HTTPException(503,'hand_landmarker.task missing or MediaPipe not ready')
 r=landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(x,cv2.COLOR_BGR2RGB)));L=np.zeros(63,np.float32);R=np.zeros(63,np.float32);lc=np.zeros(21,np.float32);rc=np.zeros(21,np.float32);lf=rf=False
 for i,h in enumerate(r.handedness):
  if i>=len(r.hand_landmarks):continue
  z=np.array([[p.x,p.y,p.z] for p in r.hand_landmarks[i]],np.float32).reshape(-1);score=float(h[0].score) if h else 0;name=h[0].category_name.lower() if h else ''
  if name=='left':L=z;lc[:]=score;lf=True
  else:R=z;rc[:]=score;rf=True
 return np.r_[L,lc,R,rc].astype(np.float32),L,R,lf,rf
def temporal(s):
 a=np.asarray(s,np.float32)
 if a.ndim!=2 or a.shape[1]!=F:raise HTTPException(400,f'sequence must be (N,{F})')
 if len(a)!=N:a=a[np.linspace(0,len(a)-1,N).astype(int)]
 d=np.diff(a,axis=0);return np.r_[a.mean(0),a.std(0),a.min(0),a.max(0),a[0],a[-1],a[-1]-a[0],np.abs(d).mean(0),d.std(0)].astype(np.float32)
def caldata():
 if not DATA.exists():return {}
 try:d=pickle.load(open(DATA,'rb'));return d if isinstance(d,dict) else {}
 except:return {}
@app.get('/health')
def health():return {'status':'ok','customModelLoaded':model is not None,'mediaPipeLoaded':landmarker is not None}
@app.get('/model-info')
def info():return {'custom':{'loaded':model is not None,'classes':classes,'frameFeatureSize':168,'sequenceFrames':32,'modelFeatureSize':1512,'threshold':TH}}
@app.post('/extract_features')
def extract(q:Img):
 f,l,r,lf,rf=feat(img(q.image_base64));return {'features':f.tolist(),'leftLandmarks':l.tolist(),'rightLandmarks':r.tolist(),'handsDetected':int(lf)+int(rf),'featureSize':168}
@app.post('/predict_custom')
def predict(q:Seq):
 if model is None:return {'label':'UNKNOWN','confidence':0,'accepted':False,'threshold':TH}
 p=model.predict_proba([temporal(q.sequence)])[0];i=int(np.argmax(p));c=float(p[i]);return {'label':str(classes[i]) if c>=TH else 'UNKNOWN','confidence':c,'accepted':c>=TH,'threshold':TH,'model':'custom'}
@app.get('/calibration/status')
def status():
 d=caldata();return {'labels':{k:len(v) for k,v in d.items()},'totalSamples':sum(map(len,d.values()))}
@app.post('/calibration/save')
def save(q:Cal):
 label=re.sub(r'\s+',' ',q.label.strip()).upper();a=np.asarray(q.sequence,np.float32);d=caldata();d.setdefault(label,[])
 if len(d[label])>=MAX:raise HTTPException(400,f'Maximum {MAX} samples allowed for {label}')
 if a.shape!=(N,F):raise HTTPException(400,f'sequence must be ({N},{F})')
 d[label].append(a);pickle.dump(d,open(DATA,'wb'));return {'success':True,'label':label,'sampleCount':len(d[label])}
@app.post('/calibration/train')
def train():
 global model,classes
 d=caldata()
 if len(d)<2 or any(len(v)<2 for v in d.values()):raise HTTPException(400,'Need at least 2 labels with at least 2 samples each.')
 X=[];y=[]
 for k,vs in d.items():
  for s in vs:X.append(temporal(s));y.append(k)
 model=RandomForestClassifier(n_estimators=400,max_features='sqrt',class_weight='balanced_subsample',random_state=42,n_jobs=-1).fit(X,y);classes=list(model.classes_);pickle.dump({'model':model,'classes':classes},open(MODEL,'wb'));return {'success':True,'numberOfClasses':len(classes),'classes':classes,'samples':len(y),'trainingAccuracy':float(model.score(X,y))}
@app.post('/calibration/reset')
def reset():
 global model,classes
 for p in [DATA,MODEL]:p.unlink(missing_ok=True)
 model=None;classes=[];return {'success':True}
def rag(q):
 try:
  from rag.rag import retrieve
  docs=retrieve(q,3)
  if docs:
   try:
    from rag.llm import generate_answer;a=generate_answer(q,docs).get('answer','')
   except:a=' '.join(x.get('content','') for x in docs)
   src=[{'title':x.get('title','Official source'),'section':x.get('section',''),'url':x.get('source_url','')} for x in docs];return {'title':docs[0].get('service','Government Assistance'),'answer':a,'sources':src}
 except Exception:pass
 db={'scholarship':('Scholarship Assistance','https://scholarships.gov.in'),'pension':('Pension Assistance','https://nsap.nic.in'),'disability':('Disability Certificate Assistance','https://swavlambancard.gov.in'),'udid':('UDID Assistance','https://www.swavlambancard.gov.in')}
 for k,(t,u) in db.items():
  if k in q.lower():return {'title':t,'answer':'Please use the official government source for current eligibility, required documents and application guidance.','sources':[{'title':t,'url':u}]}
 return {'title':'Assistance','answer':'I could not find enough verified information in the available government sources.','sources':[]}
@app.post('/api/v1/process')
def process(q:Proc):
    if not q.input.strip():
        raise HTTPException(400, 'Input is empty')

    if q.confidence is not None and q.confidence < TH:
        return {
            'status': 'success',
            'input_type': q.input_type,
            'recognized_text': q.input,
            'confidence': q.confidence,
            'intent': 'low_confidence',
            'response': {
                'title': 'Please repeat the sign',
                'answer': 'The confidence was too low. Please try the sign again clearly.',
                'sources': []
            },
            'sources': [],
            'grounded': False
        }

    result = orchestrate(
        q.input_type,
        q.input,
        q.confidence
    )

    return {
        'status': 'success',
        'input_type': q.input_type,
        'recognized_text': q.input,
        'confidence': q.confidence,
        'intent': result.get('intent'),
        'module_used': result.get('module_used'),
        'response': result.get('response'),
        'sources': result.get('sources', []),
        'grounded': result.get('grounded', False)
    }
   