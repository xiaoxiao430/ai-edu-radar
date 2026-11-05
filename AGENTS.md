# 项目约定

这是公开的AI教育项目精选库，采用原生HTML/CSS/JavaScript与静态JSON。GitHub Pages通过Actions发布，个人选择只在浏览器保存。

- 每日资料更新先读DAILY_UPDATE.md，沿用稳定ID与现有字段；教育用途优先，不凑数量，不把介绍写成实测。
- 截图、教程封面、教学示意图分别标明；不以图标冒充操作截图，保留图片原始出处。
- 保持62类OurTeacher场景、338项主目录、48项繁体补充、34条媒体的基线。调整基线需要明确依据，不把测试项重新放入可选目录。
- 不改变浏览器选择存储key，不因内容更新清空选择、优先级或备注。导入校验失败时保持原选择。
- 不提交个人选择、师生真实资料、私有目录、密钥或受保护配置。所有可见界面文字使用微软雅黑。
- 运行node scripts/validate.mjs、node scripts/test-validator.mjs、node scripts/build-snapshot.mjs。修改交互时检查真实浏览器的筛选、选择恢复、Prompt、备份及手机布局。
- 检查通过后再推送main，并核对Pages工作流成功。失败保留最后成功内容，不记为已发布。
