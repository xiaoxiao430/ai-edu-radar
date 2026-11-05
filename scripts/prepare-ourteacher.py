#!/usr/bin/env python3
"""Normalize a previously collected public OurTeacher inventory.

Usage: python3 scripts/prepare-ourteacher.py --source /path/to/public-inventory --output .
The source directory is an explicit input and is never copied into the published site.
"""
import argparse
import html
import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

DATE = '2026-11-05'
SITE = 'https://www.ourteacher.cc/'
API_APPS = 'https://api.ourteacher.cc/api/ai_app/list_ai_app'
API_WORKFLOWS = 'https://next.ourteacher.cc/api/workflow-apps'
APP_STORE = 'https://apps.apple.com/cn/app/our-teacher/id6532591718'

# Every category is a teaching purpose, rather than the vendor's display grouping.
CATEGORIES = {
    '班级与成长': list(range(1, 9)) + [44, 56, 58, 59, 60],
    '备课与作业': list(range(9, 16)) + [49, 50],
    '语文与阅读': list(range(16, 23)),
    '英语学习': list(range(23, 30)) + [57],
    '数学与科学': list(range(30, 34)),
    '地理与历史': [34, 35],
    '综合实践与艺体': [36, 37, 38, 39],
    '德育与家校': [40],
    '幼儿发展': [41, 42, 43],
    '学情与自主学习': [45, 46, 47, 62],
    '教师与学校发展': [48, 51, 52, 55, 61],
    '教学图文与媒体': [53, 54],
}
CAT_BY_SCENE = {f'C{i:02}': category for category, ids in CATEGORIES.items() for i in ids}

# Explicit normalization avoids interpreting 小高段 as 高中.
STAGES = {
    **{f'C{i:02}': ['小学', '初中', '高中'] for i in list(range(1, 6)) + [7,9,10,11,12,13,14,15,17,18,19,21,22,23,25,26,27,28,31,32,34,35,36,37,38,40,45,46,48,49,50,51,52,55,56]},
    'C06': ['小学', '初中'], 'C08': ['幼儿园', '小学', '初中'],
    'C16': ['幼儿园', '小学'], 'C20': ['小学'], 'C24': ['小学', '初中'],
    'C29': ['高中'], 'C30': ['小学', '初中'], 'C33': ['小学', '初中', '高中'],
    'C39': ['幼儿园', '小学', '初中', '高中'],
    'C41': ['幼儿园'], 'C42': ['幼儿园'], 'C43': ['幼儿园'],
    'C44': ['幼儿园', '小学', '初中', '高中'], 'C47': ['初中', '高中'],
    'C53': ['幼儿园', '小学', '初中', '高中'],
    'C54': ['幼儿园', '小学', '初中', '高中'], 'C57': [],
    'C58': ['小学', '初中'], 'C59': ['幼儿园', '小学', '初中'],
    'C60': ['幼儿园', '小学', '初中'], 'C61': ['职教大学'],
    'C62': ['幼儿园', '小学'],
}
SUBJECTS = {
    **{f'C{i:02}': ['语文'] for i in range(16,23)},
    **{f'C{i:02}': ['英语'] for i in range(23,30)},
    'C30':['数学'], 'C31':['数学'], 'C32':['数学'],
    'C33':['科学','物理','化学','生物'], 'C34':['地理'], 'C35':['历史'],
    'C36':['体育'], 'C37':['劳动','综合实践'], 'C38':['综合实践','科学'],
    'C39':['音乐','美术'], 'C40':['德育'], 'C57':['英语'],
}

# These 59 entries were present in the directory but not attached to the original
# 62 scene rows. Classifying them is editorial guidance, not a vendor claim.
EXTRA_MAPPING = {
    'A138':'C51','A301':'C51','A302':'C51','A139':'C51','A300':'C51','A303':'C51','A304':'C51',
    'A105':'C52','A478':'C42','A285':'C41','A376':'C53','A33':'C41','A205':'C41',
    'A267':'C42','A116':'C42','A47':'C41','A144':'C42','A61':'C42','A45':'C42',
    'A140':'C41','A38':'C41','A283':'C41','A296':'C43','A305':'C43','A292':'C43',
    'A50':'C41','A117':'C42','A407':'C42','A119':'C41','A128':'C41','A44':'C44',
    'A220':'C32','A234':'C32','A156':'C40','A159':'C44','A165':'C07','A168':'C52',
    'A180':'C42','A199':'C42','A206':'C58','A216':'C42','A218':'C17','A222':'C24',
    'A227':'C38','A265':'C36','A280':'C58','A288':'C17','A297':'C16','A299':'C48',
    'A397':'C17','A398':'C17','A400':'C17','A402':'C43','A411':'C17','A436':'C39',
    'A437':'C39','A450':'C59','A454':'C44','A485':'C34',
}

# A three-part teaching flow gives each scene its own explanatory visual.
FLOWS = {
    'C01':['查看课表与材料','完成当日任务','确认作业与安排'],
    'C02':['独立完成任务','同伴讨论互教','重答并查看变化'],
    'C03':['先留思考时间','抽样解释思路','计时完成练习'],
    'C04':['发布课前提醒','学生确认收到','核对遗漏与回复'],
    'C05':['记录具体表现','教师确认反馈','回看阶段进步'],
    'C06':['明确学习行为','积累成长反馈','复盘学习投入'],
    'C07':['发现一次进步','展示真实作品','说清下一步行动'],
    'C08':['设定短时任务','朗读或安静学习','检查任务质量'],
    'C09':['梳理教材目标','识别关键难点','确定检查方式'],
    'C10':['看学情定目标','设计学生任务','用出口题检查'],
    'C11':['提出单元问题','完成递进任务','用作品检验理解'],
    'C12':['从现实问题出发','学习关键概念','回到问题作解释'],
    'C13':['独立写出观点','说明理由与比较','讨论后修正表达'],
    'C14':['锁定学习目标','比较原题与变式','独立解释与迁移'],
    'C15':['识别当次错误','完成针对性补练','用新题再次检查'],
    'C16':['辨认音形与字义','词句中理解使用','纸笔书写与订正'],
    'C17':['理解课文语句','回忆默写与订正','隔日复测再巩固'],
    'C18':['读材料找信息','依据原文作推断','表达判断与理由'],
    'C19':['读关键章节','联系人物与情节','形成书评与讨论'],
    'C20':['观察图片与口述','写出具体细节','对照要求修改'],
    'C21':['保留作文原稿','聚焦一项反馈','修改后再练一段'],
    'C22':['围绕任务写作','互评修改与选编','形成班级作品报'],
    'C23':['听辨与拼读','理解词义与语境','在句中独立使用'],
    'C24':['短时词汇游戏','解释词义与用法','完成独立巩固题'],
    'C25':['按词句要求听写','按错因完成订正','隔日重新听写'],
    'C26':['听取关键信息','同伴交流与复述','按任务评价表达'],
    'C27':['读主题与结构','用原文支持推断','迁移到新情境'],
    'C28':['明确交际目的','审内容与语言','重写并解释修改'],
    'C29':['核对线索与要求','完成续写或概要','审稿修改与再写'],
    'C30':['发现易错算理','短练并解释算法','纸笔检查迁移'],
    'C31':['解释原有解法','按错因获得提示','独立完成变式'],
    'C32':['预测关系变化','操作图形或变量','解释概念与规律'],
    'C33':['提出可检验假设','控制变量并记录','依据数据解释'],
    'C34':['从地图提取信息','比较区域与图表','解释原因与方案'],
    'C35':['辨析史料来源','比较立场与背景','写出有依据解释'],
    'C36':['看动作与练习站','分组实际练习','反馈动作要点'],
    'C37':['带着真实问题','现场观察或劳动','整理资料作表达'],
    'C38':['界定真实问题','跨学科分工制作','迭代作品与反思'],
    'C39':['观察与欣赏','创作并尝试技法','说明选择与修改'],
    'C40':['讨论班级问题','角色练习与约定','一周后回看行动'],
    'C41':['保留观察与原话','分析需要与支持','跟进幼儿变化'],
    'C42':['观察儿童问题','调整材料与活动','表达游戏经验'],
    'C43':['计划本周活动','记录实际观察','调整支持与反馈'],
    'C44':['回看真实记录','说明进步与困难','约定一项配合'],
    'C45':['收集同目标作答','教师抽核批改','针对问题补练'],
    'C46':['核对同口径成绩','定位薄弱学习点','安排下周补救'],
    'C47':['按目标先自学','分步求助与练习','独立验收并复盘'],
    'C48':['聚焦一个课堂问题','复看学生作答','改一课再看变化'],
    'C49':['读取原有材料','转成可编辑资源','补任务与评价'],
    'C50':['分析目标与任务','按本校学情改编','实际试教后修订'],
    'C51':['明确真实教学问题','整理过程与记录','形成可核对结论'],
    'C52':['找重复发生事务','整理规范化模板','核对对象与时间'],
    'C53':['明确难理解关系','制作图示与板书','让学生据图解释'],
    'C54':['确定一个教学难点','选择必要媒体','检查理解是否增加'],
    'C55':['读取已有资料','梳理问题与表达','教师核对再使用'],
    'C56':['核对班级名单','按需要调整座位','收集使用反馈'],
    'C57':['查找完整教程','核对真实功能','决定能否用于教学'],
    'C58':['对应本课目标出题','短时答题与协作','解释订正再巩固'],
    'C59':['明确任务与反馈','提供合适的奖励','回看持续学习投入'],
    'C60':['约定一个家庭目标','记录具体行动','家校回看与调整'],
    'C61':['核对专业课程目标','设计实训与任务','由专业教师验收'],
    'C62':['核对真实产品入口','验证教师控制方式','再决定自学用法'],
}

PALETTES = ['#205c54','#254e70','#8b4c36','#695081','#436b50','#8a6738']

def source(title, url, date=DATE):
    return {'title':title, 'url':url, 'date':date}

def public_text(value):
    value = str(value or '').replace('香江路', '本校')
    value = value.replace('优先贴合已选初中地理方向；B站有《非洲》公开案例线索。', '优先支持初中地理课堂创新，按读图、解释与迁移递进。')
    return value

def dedupe(items):
    return list(dict.fromkeys(items))

def effort(value):
    if '待核' in value or '待需求' in value: return '待核'
    if '大' in value: return '高'
    if '中' in value: return '中'
    return '低'

def scene_why(row):
    cid = row['id']
    reason = public_text(row['link'])
    if cid in {'C01','C03','C04','C05','C07','C44'}:
        first = '已有小学成长与班务屏基础，本项优先补内容、流程和反馈，减少重复建设。'
    elif cid in {'C23','C24','C25','C26','C27','C28'}:
        first = '贴合初中英语课堂创新方向，可把词句、语篇或写作任务放进连续单元。'
    elif cid == 'C34': first = '贴合初中地理课堂创新，能把现有地图与可视化资源转成学生读图和解释的任务。'
    elif cid == 'C35': first = '贴合初中历史课堂创新，重点练习辨析史料与写出理由，方便保留前后作答。'
    elif cid in {'C21','C22'}: first = '小初高都有写作与作品积累需求，可衔接现有成长档案中的学生作品。'
    elif cid in {'C41','C42','C43'}: first = '作为幼儿学段的独立候选，围绕真实观察与活动调整，支持幼小衔接。'
    elif cid in {'C29','C47'}: first = '可以为高中自主学习准备任务与验收样例，先选有限内容验证。'
    elif cid in {'C57','C62'}: first = '当前资料只支持把它列为待核方向，先验证功能有助于避免提前投入开发。'
    elif cid == 'C61': first = '保留职教与大学方向作参考，待真实业务需求明确后再投入。'
    elif cid in {'C48','C50','C51'}: first = '能把已做课例、教研讨论和教师成长连起来，沉淀可复用的带练材料。'
    else: first = f'可先围绕“{row["sample"]}”形成一个小样例，再决定是否扩展。'
    if cid in {'C41','C42','C43'}: third = '幼儿学段看具体观察、表达与探索变化；不直接套用中小学成绩或积分。'
    elif cid == 'C61': third = '需要相应专业教师核对课程与实训要求，不把中小学模板直接移植。'
    elif not STAGES[cid]: third = '适用学段仍待完整教程核准，页面暂不替它指定年级。'
    elif len(STAGES[cid]) > 1: third = '跨学部沿用任务与反馈框架，分别调整教材、任务难度和独立完成要求。'
    else: third = f'先在{STAGES[cid][0]}选一项具体任务，观察“{row["observe"]}”，再判断推广。'
    return dedupe([first, reason, third])

def make_svg(row, outdir, index):
    cid, title = row['id'], row['title']
    color = PALETTES[index % len(PALETTES)]
    category = CAT_BY_SCENE[cid]
    steps = FLOWS[cid]
    esc = html.escape
    title_lines = [title] if len(title) <= 19 else [title[:19], title[19:]]
    title_svg = ''.join(f'<text x="48" y="{91+31*i}" font-size="26" font-weight="700">{esc(t)}</text>' for i,t in enumerate(title_lines))
    header_end = 122 if len(title_lines)==1 else 152
    boxes = []
    for i, label in enumerate(steps):
        x = 48+i*252
        boxes.append(f'''<g><rect x="{x}" y="{header_end+73}" width="232" height="162" rx="16" fill="white" stroke="{color}" stroke-opacity=".23"/>
        <circle cx="{x+34}" cy="{header_end+112}" r="16" fill="{color}"/><text x="{x+34}" y="{header_end+118}" text-anchor="middle" fill="white" font-size="15">{i+1}</text>
        <text x="{x+23}" y="{header_end+160}" font-size="19" font-weight="700">{esc(label[:10])}</text>
        <text x="{x+23}" y="{header_end+186}" font-size="17" fill="#6b7475">{esc(label[10:] if len(label)>10 else ['先有明确任务','保留实际过程','回看学习变化'][i])}</text>
        <path d="M {x+24} {header_end+208} h 90 m 12 0 h 30" stroke="{color}" stroke-opacity=".27" stroke-width="5" stroke-linecap="round"/></g>''')
        if i<2: boxes.append(f'<path d="M {x+237} {header_end+152} h 10 m -4 -5 l 5 5 -5 5" fill="none" stroke="{color}" stroke-width="2"/>')
    stage = ' / '.join(STAGES[cid]) or '学段待核'
    body = f'''<svg xmlns="http://www.w3.org/2000/svg" width="864" height="486" viewBox="0 0 864 486" role="img" aria-label="{esc(title)}教学用法示意图">
    <rect width="864" height="486" fill="#f4f2ec"/>
    <g font-family="Microsoft YaHei" fill="#263b3c"><rect x="48" y="28" width="130" height="28" rx="14" fill="{color}"/><text x="113" y="47" text-anchor="middle" fill="white" font-size="13">教学用法示意图</text>
    <text x="816" y="47" text-anchor="end" font-size="13" fill="#697775">{esc(cid)} · {esc(category)}</text>{title_svg}
    <text x="48" y="{header_end+28}" font-size="15" fill="#697775">{esc(stage)} · 从具体学习任务到反馈改进</text>
    {''.join(boxes)}
    <path d="M48 426 H816" stroke="#d7dcd4"/><text x="48" y="456" font-size="13" fill="#6c7772">根据公开目录与教学建议绘制，非 OurTeacher 操作截图</text>
    <text x="816" y="456" text-anchor="end" font-size="13" fill="{color}">内部界面待补</text></g></svg>'''
    dest = outdir/'assets'/'images'/'ourteacher'/f'{cid}.svg'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(body, encoding='utf-8')
    return {'src':f'assets/images/ourteacher/{cid}.svg', 'type':'教学用法示意图', 'caption':f'{title}：建议的教学流程；非产品操作截图，内部界面待补。', 'sourceUrl': SITE}

def tool_operation(name, scene):
    """Name-specific proposed input/output. No inferred feature is labelled tested."""
    if '批改' in name:
        return (f'一份与“{name}”对应的原始学生作答、教师评价要求和参考答案', '保留原作答、候选反馈、教师修订与学生订正', '教师抽核识别、评分和建议，再让学生独立完成一道同目标练习')
    if any(x in name for x in ['出题','命题','练习题','格式优化','题目转Word']):
        return (f'“{name}”所需的学习目标、题型、难度与原题样例', '一组可编辑题目、答案及使用说明', '逐题核对答案与目标，用学生独立作答检验难度')
    if any(x in name for x in ['质量分析','成績','成绩','反思表','赋分']):
        return (f'与“{name}”匹配的同一考试或学习任务数据及明确统计口径', '可追溯的分析表、薄弱点及对应补练安排', '用合成样例复算关键数值，确认结论能对应具体教学调整')
    if any(x in name for x in ['教案','学历案','大单元','教材','课标','语篇','教考']):
        return (f'真实教材片段、班级学情和“{name}”的目标要求', '目标、学生任务、典型错误与检查方式组成的可编辑材料', '教师审校后试教，查看学生任务与目标是否对应')
    if any(x in name for x in ['默写','默書','听写','聽寫','拼读','点读','朗读','朗讀','对话音频','對話錄音']):
        return (f'本课词句、音频或文本，以及“{name}”的使用要求', '练习材料、播放或练习安排与订正记录', '核对读音和文本，在隔日独立练习中查看保留情况')
    if any(x in name for x in ['消消乐','PK','小游戏','转盘','扭蛋','抢答','华容道','五子棋','九宫格','翻翻卡','拼图','数织','赛跑','毒药','正话反做','双人成行']):
        return (f'围绕本课目标的一小组内容和“{name}”的互动规则', '短时互动记录与配套独立巩固题', '游戏结束后检查学生能否解释并独立运用，不以游戏分数替代学习结果')
    if any(x in name for x in ['作文','习作','写话','写作','续写','續寫','范文','概要']):
        return (f'写作任务、真实学生片段及“{name}”对应的评价重点', '原稿、指导或反馈、修改稿与再次练习', '聚焦一个写作维度比较前后稿，保留学生自己的选材与表达')
    if any(x in name for x in ['观察','觀察','故事','个案','倾听','表征','作品分析','教育价值']):
        return (f'真实观察、儿童原话或作品，以及“{name}”所需的记录目标', '事实记录、解释草稿、支持建议与跟进材料', '教师区分观察事实与解释，核对后续活动是否据此调整')
    if any(x in name for x in ['课题','报告','研究','问题提出','概念界定','成果','分析与讨论','论文','降重']):
        return (f'真实教学问题、过程记录和“{name}”所需的现有材料', '有明确来源和实际过程支撑的研究草稿', '核对材料与结论的对应关系，不生成不存在的数据或参考文献')
    if any(x in name for x in ['评语','寄语','表扬','荣誉','奖状','报喜','家访','关爱','通知','回复','回覆','谈话','承诺书','规矩']):
        return (f'真实事件、沟通对象与“{name}”的具体用途', '教师可修改的具体反馈、沟通文本或展示内容', '核对事实与措辞，并写出一项家校或学生可采取的行动')
    if any(x in name for x in ['视频','影片','歌曲','数字人','數碼人','生图','图生图','板书','黑板报','信息图','画','环创','云朵字','3D','皮影','音乐']):
        return (f'本课需要表达的概念、素材和“{name}”的内容要求', '带来源说明的视觉或音视频教学素材及观察任务', '核对内容和标注，让学生通过该素材解释一个具体问题')
    if any(x in name for x in ['PPT','课件','逐字稿','文字','思维导图']):
        return (f'已有课件、教案或音视频材料及“{name}”转换目标', '保留核心内容、可继续编辑的教学资源', '检查转换后关键内容与出处是否完整，再补学生任务')
    if any(x in name for x in ['记录','计划','日历','签到','总结','心得','会议','活动','发展规划','保教','校长','AI填表','培优','师徒']):
        return (f'现有安排、真实记录与“{name}”的使用对象和时间', '可修改、能用于实际工作的计划或记录模板', '核对时间、对象和要求，比较是否减少重复整理')
    if any(x in name for x in ['积分','完成','点名','计时','时钟','秒表','分贝','音浪']):
        return (f'课堂名单或任务要求与“{name}”的使用规则', '清楚可撤回的课堂操作与任务反馈记录', '用合成名单检查操作，再看真实课堂的参与和任务质量')
    return (f'现有教学材料和“{name}”对应的明确问题', f'可用于“{scene["title"]}”的一份小样例', f'先核清“{name}”的真实能力，再按本场景的观察指标试用')

def guess_subjects(name, inherited):
    result = []
    for tokens, label in [(['英语','英語','英文','单词','單詞','be动词'],'英语'),(['语文','中文','汉字','拼音','古诗'],'语文'),(['数学','數學','计算','口算','加减','乘法','除法','数织'],'数学'),(['物理'],'物理'),(['化学'],'化学'),(['生物'],'生物'),(['地理','天气'],'地理'),(['历史','诗人','人物故事'],'历史'),(['音乐','歌曲'],'音乐'),(['美术','画'],'美术'),(['体育','队列'],'体育')]:
        if any(t in name for t in tokens): result.append(label)
    return result or inherited

def run(args):
    source_dir, outdir = Path(args.source), Path(args.output)
    read = lambda name: json.loads((source_dir/name).read_text(encoding='utf-8'))
    old_scenes = read('teaching-scenes.json')
    vendor_scenes = {str(x['id']):x for x in read('scenes.json')['data']}
    apps = read('apps.json')['data']
    workflows = read('workflows.json')['data']
    dy = read('douyin-research.json')
    scene_keys = {x['id']:list(x['keys']) for x in old_scenes}
    for key, cid in EXTRA_MAPPING.items():
        scene_keys[cid].append(key)
    # New workflow names already appear in the 62-scene source, but retain an explicit check.
    associated = defaultdict(list)
    for cid, keys in scene_keys.items():
        for key in keys: associated[key].append(cid)
    media = []
    for i, item in enumerate(dy['items'], 1):
        media.append({
            'id':f'D{i:02}', 'title':item['title'], 'summary':item.get('function',''),
            'url':item.get('url') or item.get('source_page'),
            'publishedAt':item.get('published_at'), 'checkedAt':DATE,
            'sourceType':'作品页公开索引' if 'search_index' in item['source_type'] else '聚合页官方条目',
            'note':item.get('read_status',''), 'trialStatus':'未登录运行；非课堂实测',
        })
    media_for_scene = {
        'C01':[1,2], 'C02':[10], 'C03':[30,33], 'C04':[5,6], 'C05':[4,12,13],
        'C06':[3,4,17,18,27], 'C07':[18], 'C08':[7,8,9], 'C21':[23],
        'C41':[31], 'C42':[31], 'C56':[22], 'C57':[], 'C58':[11,15,16,21,28],
        'C59':[20,34], 'C60':[29],
    }
    scene_items = []
    by_cid = {}
    media_capabilities = {
        'C01':['课表展示（官方视频标题）','值日表展示（官方视频标题）','作业同步（官方视频标题）'],
        'C56':['班级座位表操作介绍（聚合页中的官方作品）'],
        'C57':['截图可见置顶“嗨麦”教程名称，具体功能待核'],
        'C60':['家庭版宠物积分使用教程（聚合页中的官方作品）'],
        'C62':['官网介绍页列示OUR CLASS学生端','宣传页提及AI学伴、游戏化学习与学习报告，实际入口和能力待核'],
    }
    raw_by_key = {f'A{x["id"]}':x for x in apps}
    raw_by_key.update({f'W{x["id"]}':x for x in workflows})
    for i, row in enumerate(old_scenes):
        cid = row['id']
        urls = []
        if scene_keys[cid]:
            urls.append(source('OurTeacher官网公开工具目录', API_APPS))
            if any(k.startswith('W') for k in scene_keys[cid]): urls.append(source('OurTeacher公开工作流目录',API_WORKFLOWS))
        for mid in media_for_scene.get(cid,[]):
            m=media[mid-1]
            urls.append(source(m['title'],m['url'],m['publishedAt'] or DATE))
        if cid=='C57': urls.append(source('OurTeacher抖音主页：置顶嗨麦教程名称线索',dy['account']['url']))
        if cid=='C62': urls.append(source('官网宣传页列示的OUR CLASS学生端','https://geo.ourteacher.cc/'))
        if not urls: urls.append(source('OurTeacher公开目录',SITE))
        limitations = ['功能名称和目录记录已核，未逐项登录试用，也未验证课堂效果。']
        if cid in {'C57','C62'}: limitations.append('先核对真实入口与完整功能，再决定是否形成开发规格。')
        if cid=='C56': limitations.append('排座能力来自聚合页中官方作品的操作介绍，需补看完整教程。')
        if cid=='C34': limitations.append('B站同名地理展示与本公司的关系未核准，不作为已确认公司案例。')
        item={
            'id':f'ot-scene-{cid}', 'sourceId':cid, 'type':'scene', 'title':row['title'],
            'summary':public_text(row['teaching']), 'category':CAT_BY_SCENE[cid],
            'stages':STAGES[cid], 'stageNote':row['stages'], 'subjects':SUBJECTS.get(cid,['通用']),
            'priority':row['priority'], 'effort':effort(row['effort']), 'effortNote':row['effort'],
            'why':scene_why(row), 'teaching':public_text(row['teaching']),
            'existing':public_text(row['link']), 'mvp':[public_text(row['sample']), *FLOWS[cid]],
            'acceptance':[f'先形成：{row["sample"]}。',f'观察：{row["observe"]}。','用样例和教师反馈核对后，再决定是否扩大。'],
            'limitations':limitations, 'commercial':row['commercial'],
            'sources':urls, 'images':[make_svg(row,outdir,i)],
            'relatedTools':[f'ot-tool-{k}' for k in dedupe(scene_keys[cid])], 'relatedScenes':[],
            'capabilities':[raw_by_key[k]['name'] for k in dedupe(scene_keys[cid])] or media_capabilities[cid],
            'dependencies':['真实教材或活动任务','相应学科教师核对'],
            'promptNotes':[f'本期聚焦“{row["sample"]}”，不默认开发全部关联工具。',public_text(row['link']),f'以“{row["observe"]}”检查实际使用变化。'],
            'reviewStatus':'待核功能' if row['priority']=='待核后排' else '公开资料已核，教学应用为建议',
            'verifiedAt':DATE,
        }
        if row['priority']=='已有补强': item['promptNotes'].insert(0,'先检查现有成长档案与班务屏实现，复用名单、评价和任务入口，采取增量改进。')
        if row['priority']=='待核后排': item['promptNotes'].insert(0,'生成调研验证任务，不把封面或宣传说明当作已确定的功能规格。')
        scene_items.append(item); by_cid[cid]=item
    # Download only the three publicly distributed App Store screenshots. They
    # are explicitly presented as overview images, never as a specific tool UI.
    store_images=[]
    labels=['教师AI对话','官方应用首页','会员说明页']
    if args.download_screenshots:
        lookup=json.load(urllib.request.urlopen('https://itunes.apple.com/lookup?id=6532591718&country=cn',timeout=30))
        urls=lookup['results'][0].get('screenshotUrls',[])
        for i,url in enumerate(urls[:3]):
            dest=outdir/'assets'/'images'/'ourteacher'/f'appstore-{i+1}.jpg'
            urllib.request.urlretrieve(url,dest)
    for i,label in enumerate(labels):
        if (outdir/'assets'/'images'/'ourteacher'/f'appstore-{i+1}.jpg').exists():
            store_images.append({'src':f'assets/images/ourteacher/appstore-{i+1}.jpg','type':'官方应用截图','caption':f'{labels[i]}：App Store公开截图，不代表当前场景或工具的专属操作界面。','sourceUrl':APP_STORE})
    for cid in ['C09','C10','C49','C55']:
        by_cid[cid]['images'].extend(store_images)

    main_items=[]; supplements=[]; excluded=[]
    records=[(f'A{x["id"]}',x,'工具',API_APPS) for x in apps] + [(f'W{x["id"]}',x,'工作流',API_WORKFLOWS) for x in workflows]
    for key, raw, kind, api in records:
        if re.match(r'^test',raw['name'],re.I): excluded.append(raw['name']);continue
        languages=dedupe(vendor_scenes[x]['language'] for x in raw['scene_id'].split(','))
        is_supplement='zh_CN' not in languages
        cids=associated.get(key,[])
        if not cids:
            # Traditional-column counterparts are a separately labelled appendix.
            n=raw['name']
            if any(t in n for t in ['批改','默書']): cids=['C45']
            elif any(t in n for t in ['數學','STEAM']): cids=['C31' if '數學' in n else 'C38']
            elif any(t in n for t in ['英語','英文','單詞']): cids=['C23']
            elif any(t in n for t in ['中文']): cids=['C17']
            elif any(t in n for t in ['教案','教材','學習','設計']): cids=['C10']
            elif any(t in n for t in ['PPT','文字','逐字稿','音視頻']): cids=['C49']
            elif any(t in n for t in ['質量','成績']): cids=['C46']
            else: cids=['C55']
        primary=by_cid[cids[0]]
        name=raw['name']; input_text,output_text,check=tool_operation(name,primary)
        official_tags=[v['name'] for v in raw.get('cates',[])]
        stages=primary['stages']
        known=[v for v in ['幼儿园','小学','初中','高中'] if v in official_tags]
        if known:stages=known
        if name.startswith('高中') or '高考' in name:stages=['高中']
        elif name.startswith('初中'):stages=['初中']
        elif '幼' in name or '保教' in name or '安吉' in name:stages=['幼儿园']
        elif '中职' in name:stages=['职教大学']
        specific_why=[
            f'在“{primary["title"]}”中，建议用“{name}”先处理一项具体任务：{output_text}。',
            f'复用现有基础：{primary["existing"]}',
            f'先以“{name}”的一份样例检查可用性，重点是：{check}。',
        ]
        tool={
            'id':f'ot-tool-{key}','sourceId':key,'type':'tool','title':name,
            'summary':f'官网目录列示的{kind}；本次建议用于{primary["title"]}，具体能力需登录核对。',
            'category':primary['category'],'stages':stages,'subjects':guess_subjects(name,primary['subjects']),
            'priority':primary['priority'],'effort':primary['effort'],'why':specific_why,
            'teaching':f'建议输入{input_text}，整理为{output_text}；{check}。',
            'existing':primary['existing'],'mvp':[f'只先完成“{name}”对应的一个具体教学任务。',f'输入：{input_text}。',f'输出：{output_text}。'],
            'acceptance':[check,f'教师能修改“{name}”的候选结果，保留原材料与确认后的版本。',f'按“{primary["title"]}”的要求，用合成样例完成一次完整流程。'],
            'limitations':['仅确认公开目录中的名称与栏目，未逐项验证能力、收费、账户或终端限制。','这里的输入输出和改造范围是教学应用建议，不是原产品已实测能力。'],
            'commercial':primary['commercial'],'sources':[source('官网公开目录原始记录',api),source('官网入口（进入工具后可能需要登录）',f'{SITE}next/chat/{raw["id"]}' if key.startswith('W') else f'{SITE}bot/{raw["id"]}')],
            'images':[primary['images'][0]],'iconUrl':raw.get('icon',''),'iconType':'官方工具图标，不是操作截图',
            'relatedTools':[],'relatedScenes':[f'ot-scene-{cid}' for cid in cids],
            'capabilities':[name],'dependencies':['相应教材或真实任务','教师核对输入与输出','实际产品账号与当前使用条件待核'],
            'promptNotes':[f'只开发已选“{name}”的最小版本，不因为关联场景存在就开发其中所有功能。',f'输入：{input_text}。',f'输出：{output_text}。',f'验收：{check}。'],
            'reviewStatus':'目录已核，未逐项试用','verifiedAt':DATE,
            'officialCategories':[vendor_scenes[x]['name'].replace('🔄','、') for x in raw['scene_id'].split(',')],
            'officialTags':official_tags,'kind':kind,'language':'zh_HK' if is_supplement else 'zh_CN',
            'mappingNote':'教学归类为本次整理建议，不代表产品原有栏目或效果。',
        }
        if raw.get('bot_state')==2:tool['limitations'].append('返回工具状态为2，当前可用性待核。')
        if is_supplement:supplements.append(tool)
        else:main_items.append(tool)
    assert len(scene_items)==62 and len(main_items)==338 and len(supplements)==48 and len(media)==34
    assert len(excluded)==2
    assert all(x['relatedScenes'] for x in main_items)
    required_arrays=['why','mvp','acceptance','limitations','capabilities','dependencies','promptNotes']
    assert all(x.get(field) for x in scene_items+main_items+supplements for field in required_arrays)
    main_ids={x['id'] for x in main_items}
    assert all(t in main_ids for x in scene_items for t in x['relatedTools'])
    # Primary associations are bidirectional. Supplemental records do not expand
    # a main scene's selectable tool list or its 338-item count.
    for tool in main_items:
        for sid in tool['relatedScenes']:
            sc=by_cid[sid.replace('ot-scene-','')]
            if tool['id'] not in sc['relatedTools']:sc['relatedTools'].append(tool['id'])
    result={
        'schemaVersion':1,'verifiedAt':DATE,
        'description':'OurTeacher公开内容参考库。目录存在与实际可用、教学效果分别看待；教学归类与改造范围均为建议。',
        'scenes':scene_items,'tools':main_items,'supplemental':supplements,'media':media,
        'stats':{'scenes':62,'mainTools':338,'supplemental':48,'media':34,'excludedTests':2,'rawTools':376,'rawWorkflows':12,'fullyMappedMainTools':338},
        'excludedTestNames':excluded,
        'boundaries':['本轮覆盖公开目录与34条抖音代表内容，未逐条核看截图所示全部作品。','官网内部操作界面多需登录；示意图与官方截图明确分开。','适用学段、教学改造与投入为建议；未逐项验证功能或课堂效果。'],
        'account':{'name':'OurTeacher App','company':'上海皑顿信息技术有限公司','url':dy['account']['url']},
    }
    output=outdir/'data'/'ourteacher.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(output),'stats':result['stats'],'images':len(list((outdir/'assets'/'images'/'ourteacher').glob('*'))),'sizeBytes':output.stat().st_size},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True)
    parser.add_argument('--output',default='.')
    parser.add_argument('--download-screenshots',action='store_true')
    run(parser.parse_args())
