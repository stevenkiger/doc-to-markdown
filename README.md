# Doc → Markdown

Convert PDFs, Word docs, PowerPoints, spreadsheets, and text files into clean LLM-ready markdown — split by section.

## Deploy to Vercel (5 minutes)

### 1. Push to GitHub
- Create a new repo at github.com
- Upload all these files keeping the same folder structure

### 2. Deploy on Vercel
- Go to vercel.com and sign up with your GitHub account
- Click "Add New Project" and import your repo
- Click Deploy (no build settings needed)

### 3. Add your Anthropic API key
- In your Vercel project, go to Settings → Environment Variables
- Add a new variable:
  - Name: `ANTHROPIC_API_KEY`
  - Value: your key from console.anthropic.com
- Go to Deployments → click the three dots → Redeploy

Your app is now live at `your-project.vercel.app` — share that URL with your team.

## File structure
```
doc-to-markdown/
├── api/
│   └── convert.js      # Serverless API proxy (keeps your API key secret)
├── public/
│   └── index.html      # The app
├── vercel.json         # Vercel config
└── README.md
```
