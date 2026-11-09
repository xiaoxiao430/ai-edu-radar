#!/usr/bin/env python3
"""Build an advisory teaching-position map from public records; no browser choices are read."""
import json
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
read = lambda p: json.loads((ROOT / p).read_text())
raw = read('data/ourteacher.json')
manifest = read('data/manifest.json')
scenes = {r['id']: r for r in raw['scenes']}
projects = {}
for ref in sorted(manifest['dates'], key=lambda r: r['date']):
    for record in read(ref['path'])['projects']: projects[record['id']] = record
records = raw['scenes'] + raw['tools'] + list(projects.values())
stage_subjects = {
 '幼儿园':['健康','语言','社会','科学','艺术','保教管理','家园共育','教师发展'],
 '小学':['语文','数学','英语','科学','道德与法治','体育与健康','音乐','美术','信息科技','劳动','综合实践','心理健康','跨学科','班级管理','学情分析','教师发展','学校事务'],
 '初中':['语文','数学','英语','物理','化学','生物','地理','历史','道德与法治','体育与健康','音乐','美术','信息科技','劳动','综合实践','心理健康','跨学科','班级管理','学情分析','教师发展','学校事务'],
 '高中':['语文','数学','英语','物理','化学','生物','地理','历史','思想政治','体育与健康','音乐','美术','信息技术','通用技术','劳动','综合实践','心理健康','跨学科','班级管理','学情分析','教师发展','学校事务'],
 '职教大学':['语文','数学','英语','专业课程','通识课程','综合实践','跨学科','班级管理','学情分析','教师发展','学校事务'],
}
profiles = {
 '幼儿园':{'goal':'围绕游戏与生活中的真实表现，观察幼儿在健康、语言、社会、科学和艺术领域的发展。','process':'教师准备适宜材料并共同参与，记录幼儿言行；不要求幼儿独立操作AI或完成小学化练习。','assessment':'以过程观察、作品和个别支持记录判断变化，不以统一分数或识字量替代发展评价。'},
 '小学':{'goal':'在具体情境中理解基础概念、形成学习习惯，并能用语言、操作或作品说明自己的想法。','process':'短任务示范后独立尝试，教师抽查原始作答，再安排一次有针对性的订正或表达。','assessment':'查看学生能否独立完成一项同类任务，比较初稿与订正，不能只看游戏积分或生成结果。'},
 '初中':{'goal':'建立概念之间的联系，在语篇、数据或资料中推理，逐步形成独立学习与自我检查能力。','process':'先独立分析问题，再用资料讨论和核对；教师围绕具体错误反馈，学生说明修改依据。','assessment':'要求保留推理过程与材料出处，在变式任务中独立迁移，并解释修改理由。'},
 '高中':{'goal':'在复杂材料中建立模型、形成论证并迁移应用，对学习策略和判断依据进行反思。','process':'学生先独立完成探究或论证，按需要查询资料；教师核对关键判断，再用新情境作独立检验。','assessment':'按学科任务要求检查论证、迁移和独立完成程度，不以AI答复或自动评分代替验收。'},
 '职教大学':{'goal':'联系专业或通识学习中的真实任务，形成可操作、可解释、可检验的成果。','process':'先明确课程对象和专业要求，以案例或实作开展任务；教师审核资料、步骤和成果。','assessment':'按具体课程标准验收作品、操作或论证，专业要求和课程接口需由任课教师另行确认。'},
}
core = {s:[x for x in subjects if x in ['语文','数学','英语','科学','物理','化学','生物','地理','历史','道德与法治','思想政治']] for s,subjects in stage_subjects.items()}
curriculum = {s:[x for x in subjects if x not in ['心理健康','跨学科','班级管理','学情分析','教师发展','学校事务','保教管理','家园共育']] for s,subjects in stage_subjects.items()}
subject_focus = {
 '语文':{'小学':'把字词、阅读理解与清楚表达放进同一任务','初中':'以文本细节支持阅读解释与写作修改','高中':'在多文本与写作中形成有依据的分析和论证'},
 '英语':{'小学':'围绕图片、实物和短语句完成听说与基础词汇运用','初中':'在语篇和交际任务中联系词汇、句法与表达','高中':'分析语篇结构与语用目的，在新情境中完成准确、有依据的表达'},
 '数学':{'小学':'用操作、图示和语言解释数量关系','初中':'联系概念、运算和推理，并说明解题依据','高中':'在函数、几何或统计情境中建模、论证并独立迁移'},
 '科学':{'幼儿园':'在可感知的游戏材料中提问、比较和表达发现','小学':'从观察、测量和简单实验形成解释'},
 '物理':{'初中':'用现象、数据和简单模型解释规律','高中':'联系模型条件、量的关系和数据论证'},
 '化学':{'初中':'联系宏观现象与物质变化的初步解释','高中':'结合结构、性质和实验资料形成推理'},
 '生物':{'初中':'用观察和资料解释生命现象','高中':'联系结构、功能和调节机制开展资料分析'},
 '地理':{'初中':'从地图与现实资料中识别空间联系','高中':'综合自然与人文因素解释区域问题'},
 '历史':{'初中':'区分史实、材料与解释，建立时空联系','高中':'比较史料观点，用出处和语境支持历史论证'},
 '健康':{'幼儿园':'在运动、生活与自我照顾中观察具体变化'},
 '语言':{'幼儿园':'在倾听、讲述、绘本和生活标识中主动表达'},
 '社会':{'幼儿园':'在同伴交往与共同游戏中理解规则并表达感受'},
 '艺术':{'幼儿园':'在声音、色彩、动作和材料探索中表现想法'},
}
common_focus = {
 '体育与健康':'围绕动作、运动参与和自我保护开展练习与反馈', '音乐':'以聆听、节奏、演唱或创作表现理解',
 '美术':'通过材料、构图与创作过程表达和讨论想法', '道德与法治':'联系生活情境、规则和判断依据',
 '思想政治':'在现实材料中进行概念辨析与有依据的论证', '劳动':'经历计划、实际操作、整理和反思',
 '综合实践':'围绕真实问题分工、调查、制作并反思', '信息科技':'用信息表达、数据处理或程序解决具体问题',
 '信息技术':'分析数据与信息系统，检查实现过程和应用条件', '通用技术':'经历设计、制作、测试与改进',
 '心理健康':'开展适龄的情绪表达、自我认识和支持性活动', '跨学科':'围绕共同问题连接相关学科方法，保留学科边界',
 '班级管理':'把规则、任务与学生确认放在清楚的一次班级流程中', '学情分析':'从原始作答与明确指标出发安排后续教学',
 '教师发展':'以真实课例或研究材料支持教师反思和协同改进', '学校事务':'处理明确职责、时间与确认流程，形成可修改的事务材料',
 '保教管理':'围绕一日活动、环境和照护计划记录教师工作', '家园共育':'围绕可核对的幼儿表现与家庭沟通，形成共同支持安排',
 '专业课程':'依据真实专业任务和操作条件准备教学流程', '通识课程':'围绕具体主题阅读、讨论与形成论证',
}
management = {1,4,5,6,7,44,56,59,60}
planning = {9,10,11,12,13,14,15,49,50}
classroom = {2,3,58}
research = {48,51,55}
unknown_scenes = {'ot-scene-C57','ot-scene-C62'}

def numeric(scene): return int(scene['id'].split('C')[-1])
def normalize_subject(subject, stage):
    if subject in ('通用','综合教研'): return '教师发展' if subject == '综合教研' else None
    if subject == '体育':return '体育与健康'
    if subject == '德育':return '思想政治' if stage == '高中' else '道德与法治'
    if subject == '信息技术' and stage in ('小学','初中'):return '信息科技'
    if subject in ('物理','化学','生物') and stage == '小学':return '科学'
    if subject == '地理' and stage == '小学':return '科学'
    if subject == '历史' and stage == '小学':return '语文'
    if stage == '职教大学' and subject in ('地理','历史','科学','生物','物理','化学'):return '通识课程'
    return subject if subject in stage_subjects[stage] else None

def stage_candidates(record, scene):
    stages=list(record.get('stages',[])); title=record['title']; n=numeric(scene)
    if n in (57,62):return []
    if '高考' in title or '高中' in title:stages=[s for s in stages if s=='高中']
    elif '初中' in title:stages=[s for s in stages if s=='初中']
    elif '小学' in title:stages=[s for s in stages if s=='小学']
    if any(x in title for x in ('中职','大学')):stages=[s for s in stages if s=='职教大学']
    if n in (41,42,43):return [s for s in stages if s=='幼儿园']
    if n==61:return [s for s in stages if s=='职教大学']
    if n in research|{52}:return [s for s in stages if s in stage_subjects]
    # 幼师专用观察表可用于科学领域，不能显示为幼儿园物理/化学/生物课。
    allowed=set(scene.get('stages',[]))
    if n in (33,40) and '幼儿园' in stages:allowed.add('幼儿园')
    if record.get('type')=='project' and '职教大学' in stages:allowed.add('职教大学')
    if any(x in title for x in ('描红','衡水体','拼音','加减法','乘法练习','除法练习','比大小练习','时钟生成')):
        stages=[s for s in stages if s not in ('幼儿园','高中')]
    return [s for s in stages if s in allowed]

def subjects_for(record, scene, stage):
    n=numeric(scene);title=record['title'];source=[x for x in record.get('subjects',[]) if x!='通用']
    # 管理/教研不因为目录含“通用”就成为所有学科的教学内容。
    if n in research:return ['教师发展']
    if n==52:return ['保教管理' if stage=='幼儿园' else '教师发展' if any(x in title for x in ('教研','教学计划','教育总结','培训心得','读书心得')) else '学校事务']
    if n in management or any(x in title for x in ['班级宠物','班级积分']):
        if stage=='幼儿园':return ['家园共育' if n in (44,60) else '保教管理']
        return ['班级管理']
    if stage=='幼儿园':
        if n==43:
            if any(x in title for x in ('成长评估','成长档案')):return ['健康','语言','社会','科学','艺术']
            return ['健康'] if '保育活动观察' in title else ['保教管理']
        if n==41:return ['健康','语言','社会','科学','艺术']
        if n==42:
            if any(x in title for x in ('混色','画板','表征图','表征小人')):return ['艺术']
            if any(x in title for x in ('沉与浮','海绵')):return ['科学']
            if '环创' in title:return ['艺术','保教管理']
            return ['健康','语言','社会','科学','艺术']
        if n==16:return ['语言']
        if n==33:return ['科学']
        if n==39:return ['艺术']
        if n==40:return ['社会']
        if n==8:return ['语言','保教管理'] if '音浪' in title or record['type']=='scene' else ['保教管理']
        if n in (53,54):return ['语言','艺术']
        return ['教师发展']
    explicit=[]
    for sub in source:
        v=normalize_subject(sub,stage)
        if v and v not in explicit:explicit.append(v)
    if n==61:return ['专业课程','教师发展']
    if n==40:return ['心理健康'] if '心理' in title else ['思想政治' if stage=='高中' else '道德与法治']
    if n==8:return ['语文','英语','跨学科'] if '朗读' in title or '音浪' in title else ['跨学科']
    if n==46:
        if any(x in title for x in ['多学科','班级间','成绩看板','成绩录入','高考赋分']):return ['学情分析']
        return core[stage]+['学情分析']
    if n==45:return explicit or core[stage]
    if n==47:return explicit or core[stage]
    if n in classroom:return explicit or core[stage]+['跨学科']
    if n in planning:
        # 工具明确学科时保持限制；一般备课/作业工具按本学段课程分别设计任务。
        if explicit:return explicit
        return curriculum[stage]+['跨学科']
    if n==16:return ['数学'] if '数字' in title else ['语文']
    if n in (17,18,19,20,21,22):return explicit or ['语文']
    if n in (23,24,25,26,27,28,29):return ['英语']
    if n in (30,31,32):return ['数学']
    if n==33:return [s for s in explicit if s in ('科学','物理','化学','生物')] or (['科学'] if stage=='小学' else ['物理','化学','生物'])
    if n==34:return ['科学','综合实践'] if stage=='小学' else ['地理']
    if n==35:return ['语文','道德与法治','综合实践'] if stage=='小学' else ['历史']
    if n==36:return ['体育与健康']
    if n in (37,38):
        if '信息技术' in title:return ['信息科技' if stage in ('小学','初中') else '信息技术']
        subjects=['劳动','综合实践'] if n==37 else ['跨学科','科学'] if stage=='小学' else ['跨学科']
        # 项目明确标注信息学科时保留对应入口，不依赖标题是否写出“信息技术”。
        if n==38 and record.get('type')=='project':
            subjects += [s for s in explicit if s in ('信息科技','信息技术','通用技术') and s not in subjects]
        return subjects
    if n==39:return [s for s in explicit if s in ('音乐','美术')] or ['音乐','美术']
    if n in (53,54):
        if explicit:return explicit
        return ['语文','英语','美术','跨学科']
    return explicit or ['跨学科']

placements=[];keys=set();unplaced=[]
for record in records:
    related=[record['id']] if record['type']=='scene' else record.get('relatedScenes',[])
    if record['id'] in unknown_scenes:
        unplaced.append({'recordId':record['id'],'reason':'功能或学生端使用条件尚未核清，保留待核入口，不推定适合某个学段学科。'});continue
    count=0
    for scene_id in related:
        scene=scenes.get(scene_id)
        if not scene or scene_id in unknown_scenes:continue
        # 修正过宽的旧关联：高中试卷讲评不能冒充续写/概要写作。
        if record['id']=='ot-tool-A126' and scene_id=='ot-scene-C20':
            scene=scenes['ot-scene-C21'];scene_id=scene['id']
        if record['id']=='ot-tool-A491' and scene_id=='ot-scene-C29':
            scene=scenes['ot-scene-C47'];scene_id=scene['id']
        for stage in stage_candidates(record,scene):
            for subject in subjects_for(record,scene,stage):
                if subject not in stage_subjects[stage]:continue
                key=(record['id'],stage,subject,scene_id)
                if key in keys:continue
                keys.add(key);n=numeric(scene);count+=1
                focus=subject_focus.get(subject,{}).get(stage) or common_focus.get(subject) or f'完成适合{stage}的{subject}具体任务'
                learning=record.get('learningGoal') or scene.get('summary') or record.get('summary','')
                teacher=record.get('teacherAction') or '按本期目标选择材料、检查原始过程并给出反馈'
                student=record.get('studentAction') or '独立完成适龄任务，说明想法并按反馈改进'
                output=record.get('dataOutput') or (record.get('mvp') or ['一项可查看、修改和复用的教学任务'])[0]
                if subject in ('教师发展','学校事务','保教管理','家园共育','班级管理','学情分析'):
                    student='不新增学生端操作；按原有安排参与活动，教师仅整理已发生的表现或作答' if subject!='班级管理' else ('按图示确认当日任务与规则，教师帮助理解' if stage=='小学' else '确认任务与责任，按约定反馈完成情况')
                elif stage=='幼儿园':
                    student=f'在{subject}游戏或生活活动中操作、讲述或表现，由教师观察记录'
                    teacher='准备真实活动与材料，观察幼儿的原话、动作或作品，再核对整理结果'
                if subject in ('教师发展','学校事务','保教管理','家园共育'):
                    goal=f'{stage}·{subject}：{focus}。{learning}'
                    acceptance=['核对原始材料与输出逐项对应；未发生的过程、数据和结论不得补写。','负责人可修改、确认并复用结果；本期只完成一个实际流程。']
                elif subject=='班级管理':
                    goal=f'{stage}·班级管理：{learning}'
                    acceptance=['用虚构班级跑完一次配置、学生确认与教师处理流程。','规则可解释、状态可改正；积分不直接代替学业或综合素质判断。']
                else:
                    goal=f'{stage}·{subject}：{focus}。本场景先做：{learning}'
                    acceptance=[profiles[stage]['assessment'],'教师能从原始作答、作品或观察记录核对结果，并安排一次有目标的改进。']
                scene_label = scene['title']
                if stage=='幼儿园':scene_label={16:'生活标识、绘本与语言表达',33:'游戏中的观察、比较与科学发现',39:'声音、色彩与创作表达',40:'同伴相处与规则体验'}.get(n,scene_label)
                elif stage=='小学':scene_label={34:'生活中的方位、天气与环境观察',35:'故事、人物与过去生活'}.get(n,scene_label)
                placements.append({'recordId':record['id'],'sceneLabel':scene_label,'stage':stage,'subject':subject,'sceneId':scene_id,'basis':'教学改造建议：按原目录名称、既有关联与本学段任务整理，非原产品已实测的课程覆盖。','goal':goal,'teacherAction':teacher,'studentAction':student,'output':output,'acceptance':acceptance})
    if not count:unplaced.append({'recordId':record['id'],'reason':'现有学段或场景关系不足，暂不强行分配，需补教学样例后再确认。'})

# 学科以有效关系可见，目录同时保留本校规划门类；不以不存在的关系显示有项目。
relations={stage:{subject:0 for subject in subjects} for stage,subjects in stage_subjects.items()}
for p in placements:relations[p['stage']][p['subject']]+=1
result={'schemaVersion':1,'verifiedAt':date.today().isoformat(),'scope':'这是厚外教学开发位置的建议关系表。学段、学科或发展领域、教学场景分别保存；正向查找与反向推断共用这一张表。关系条数不是新增项目数，也不代表原产品已覆盖或经过课堂实测。','subjectLabelByStage':{'幼儿园':'发展领域 / 保教工作','小学':'学科 / 工作领域','初中':'学科 / 工作领域','高中':'学科 / 工作领域','职教大学':'课程 / 工作领域'},'stageSubjects':stage_subjects,'stageProfiles':profiles,'placements':placements,'unplaced':unplaced,'stats':{'placements':len(placements),'coveredRecords':len(set(x['recordId'] for x in placements)),'scenes':len(set(x['sceneId'] for x in placements)),'tools':len(set(x['recordId'] for x in placements if x['recordId'].startswith('ot-tool-'))),'projects':len(set(x['recordId'] for x in placements if x['recordId'].startswith(('repo:','web:')))),'subjectCounts':relations}}
(ROOT/'data/teaching-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['stats'],ensure_ascii=False))
print('unplaced',json.dumps(unplaced,ensure_ascii=False))
