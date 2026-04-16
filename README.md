# FIRE Assistant MVP

一个帮助用户实现财务独立（FIRE）的支出跟踪和分析工具。通过智能分类和AI驱动的审查，帮助用户理解消费习惯，优化财务决策。

## 功能特性

- **智能支出分类**：将支出分为五类（生存刚需、情绪补偿、社交认同、自我成长、克制与战利品）
- **多维度标签系统**：
  - 心理动机标签（压力、疲惫、孤独等）
  - 心理属性标签（生存刚需、情绪补偿等）
  - 现实类别标签（餐饮、交通、娱乐等）
- **数据可视化**：使用图表展示支出趋势和分布
- **AI审查报告**：基于OpenAI的智能分析，提供双周或八周消费趋势报告
- **云端存储**：基于CloudBase的数据存储和同步

## 技术栈

- **前端**：Next.js 14, React, TypeScript, Tailwind CSS
- **后端**：Next.js API Routes
- **数据库**：CloudBase
- **AI**：OpenAI API
- **图表**：Recharts

## 安装和运行

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装步骤

1. 克隆项目：
   ```bash
   git clone <repository-url>
   cd fire-assistant-mvp
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 配置环境变量：
   
   创建 `.env.local` 文件并设置以下变量：
   ```env
   TCB_ENV_ID=your-cloudbase-env-id
   TCB_SECRET_ID=your-cloudbase-secret-id
   TCB_SECRET_KEY=your-cloudbase-secret-key
   DEEPSEEK_API_KEY=your-openai-api-key
   ```

4. 配置CloudBase：
   
   参考 `CLOUDBASE_SETUP.md` 文件设置CloudBase数据库和权限。

5. 运行开发服务器：
   ```bash
   npm run dev
   ```

6. 打开浏览器访问 `http://localhost:3000`

## 构建和部署

### 构建生产版本

```bash
npm run build
npm start
```

### 部署到Vercel

1. 推送代码到GitHub
2. 在Vercel中导入项目
3. 设置环境变量
4. 部署

## API文档

### 账单条目API

- `GET /api/entries` - 获取用户的所有账单条目
- `POST /api/entries` - 创建新的账单条目
- `PATCH /api/entries/[id]` - 更新指定账单条目
- `DELETE /api/entries/[id]` - 删除指定账单条目

请求头需要包含 `x-user-id`。

### 审查API

- `POST /api/review` - 生成AI审查报告

支持双周和八周趋势分析。

## 使用指南

1. **记录支出**：
   - 选择心理动机标签
   - 选择心理属性类别
   - 选择现实消费类别
   - 输入金额和描述

2. **记录克制行为**：
   - 切换到"克制"模式
   - 选择克制类型
   - 记录节省金额

3. **查看分析**：
   - 浏览图表了解消费分布
   - 使用AI审查获取个性化建议

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 许可证

MIT License

## 免责声明

本应用仅用于个人财务管理，不构成专业财务建议。请根据自身情况谨慎使用。</content>
<parameter name="filePath">d:\下载专用\FIREbill-main\FIREbill-main\README.md
