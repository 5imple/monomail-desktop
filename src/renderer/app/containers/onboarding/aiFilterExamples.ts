/* eslint-disable no-irregular-whitespace */
export const AI_FILTER_TEMPLATES = {
  work: [
    {
      id: 'needs-reply',
      name: 'Needs Reply',
      description: 'Emails requiring your direct response',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Needs Reply'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Can you confirm availability?',
        'Please review and reply',
        'What are your thoughts?'
      ],
      prompt: `Match if ALL are true:
- Email is from a real person (not automated)
- Contains a clear request, question, opinion, or decision prompt
- Explicitly requires your personal response

Examples to Match:
- "Can you confirm availability?"
- "Do you have any thoughts on this?"
- "Please review and reply"
- "Let me know how you'd like to proceed."

Do NOT match if:
- Newsletter, notification, or promotional message
- Does not need your reply
- It's informational only, with no action or reply expected`
    },
    {
      id: 'cold-outreach',
      name: 'Cold Outreach',
      description: 'Unsolicited sales and marketing emails',
      color: { background: '#efefef', text: '#434343' },
      outputLabels: ['Mono/Cold Outreach'],
      markAsDone: false,
      moveToTrash: true,
      examples: [
        'Sales pitch from unknown sender',
        'LinkedIn connection request',
        'Cold email proposal'
      ],
      prompt: `Match if ALL are true:
- Sender is unknown to you or your organization
- Attempts to sell, promote, or book a call/demo
- Not part of an existing conversation or vendor relationship

Examples to Match:
- "We help companies like yours 10× their pipeline!"
- "Would love to hop on a quick 15‑minute call."
- "Special discount just for you—sign up today."

Do NOT match if:
- Sender is a known partner, client, or colleague
- Email is transactional (receipt, confirmation, etc.)
- You explicitly requested the information`
    },
    {
      id: 'meetings',
      name: 'Meetings',
      description: 'Calendar invites and meeting-related emails',
      color: { background: '#b6cff5', text: '#0d3472' },
      outputLabels: ['Mono/Meetings'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Calendar invitation', 'Meeting agenda', 'Zoom link for tomorrow'],
      prompt: `Match if ALL are true:
- Email contains a calendar invite, scheduling request, or conferencing link
- References a specific date, time, or agenda
- Relates to a future or rescheduled meeting

Examples to Match:
- "Please find the Zoom link for tomorrow's sync."
- "Outlook invite: Quarterly Roadmap Review."
- "Agenda attached for Friday's client call."

Do NOT match if:
- It is a meeting recap sent after the event
- General discussion without scheduling details
- Automated status notifications from CI/CD tools`
    },
    {
      id: 'team-updates',
      name: 'Team Updates',
      description: 'Internal team communications and updates',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Team Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Weekly standup notes', 'Project milestone update', 'Team announcement'],
      prompt: `Match if ALL are true:
- Sender is an internal teammate or internal mailing list
- Provides status updates, announcements, or recap notes
- No immediate reply or decision required

Examples to Match:
- "Here are the notes from today's stand‑up."
- "Milestone 2 is complete—great work team!"
- "Company all‑hands recording is now available."

Do NOT match if:
- External stakeholder or client communication
- Direct request for your reply (use Needs Reply)
- Automated system or deployment notifications`
    }
  ],

  personal: [
    {
      id: 'promotions',
      name: 'Promotions',
      description: 'Marketing emails and promotional offers',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Promotions'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['50% off sale', 'New product announcement', 'Limited time offer'],
      prompt: `Match if ALL are true:
- Email promotes a product, service, or sale
- Sent by a brand, retailer, or marketing list
- Contains discount codes, coupons, or limited‑time offers

Examples to Match:
- "Flash Sale: 50 % off everything!"
- "Introducing our new summer collection."
- "Only 24 hours left to save."

Do NOT match if:
- Transactional receipts or shipping notices
- Confirmations for purchases you made
- Personal messages from friends or family`
    },
    {
      id: 'transactional',
      name: 'Transactional',
      description: 'Purchase confirmations and receipts',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Transactional'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Order confirmation', 'Payment receipt', 'Shipping notification'],
      prompt: `Match if ALL are true:
- Email confirms a purchase, payment, or account action
- Contains order numbers, invoice totals, or tracking links
- Sender is an e‑commerce store, payment processor, or service you used

Examples to Match:
- "Your order #12345 has shipped."
- "Payment receipt—Thank you for your purchase."
- "Subscription renewal confirmation."

Do NOT match if:
- Marketing newsletters or sales promotions
- Personal correspondence
- Account security alerts (use Account Alerts)`
    },
    {
      id: 'newsletters',
      name: 'Newsletters',
      description: 'Subscribed newsletters and digests',
      color: { background: '#e3d7ff', text: '#3d188e' },
      outputLabels: ['Mono/Newsletters'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Morning Brew digest', 'Tech newsletter', 'Weekly roundup'],
      prompt: `Match if ALL are true:
- Recurring content from a publication or mailing list
- Summarizes news, articles, or curated content
- Typically scheduled (daily, weekly, monthly)

Examples to Match:
- "Morning Brew—Monday Edition."
- "Hacker News Weekly digest."
- "Design Inspiration Round‑up."

Do NOT match if:
- Promotional blasts or one‑off sales emails
- Personalized outreach requiring reply
- Account statements or alerts`
    },
    {
      id: 'todo',
      name: 'To Do',
      description: 'Emails with specific action items or tasks to complete',
      color: { background: '#fbc8d9', text: '#83334c' },
      outputLabels: ['Mono/To Do'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Please send me the report by Friday',
        'Reminder: Submit your timesheet',
        'Action required: Approve expense'
      ],
      prompt: `Match if ALL are true:
- Email contains a specific action item or task for you to complete
- Has a clear deliverable or deadline (explicit or implied)
- Requires you to DO something beyond just reading or replying

Examples to Match:
- "Please send me the Q3 budget by end of week."
- "Don't forget to submit your expense report."
- "Action required: Approve Sarah's vacation request."
- "Reminder: Complete your annual training by Friday."

Do NOT match if:
- Just asking for a quick reply or opinion (use Needs Reply)
- Informational updates with no action required
- Automated notifications or status updates
- Requests directed to someone else or a team generally`
    }
  ],

  development: [
    {
      id: 'code-reviews',
      name: 'Code Reviews',
      description: 'Pull requests and code feedback',
      color: { background: '#c9daf8', text: '#1c4587' },
      outputLabels: ['Mono/Code Reviews'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['PR ready for review', 'Requested changes', 'Code review approved'],
      prompt: `Match if ALL are true:
- Email references a pull request, merge request, or code change
- Contains links to GitHub/GitLab/Bitbucket or similar
- Seeks review, approval, or comments on code

Examples to Match:
- "PR #42 is ready for your review."
- "Changes requested on branch feature/login."
- "Code review approved—thanks!"

Do NOT match if:
- CI/CD build or deployment notifications (use Deployments)
- General project updates (use Team Updates)
- Security vulnerability emails (use Security Alerts)`
    },
    {
      id: 'deployments',
      name: 'Deployments',
      description: 'CI/CD and deployment notifications',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Deployments'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Build successful', 'Deployment failed', 'Pipeline completed'],
      prompt: `Match if ALL are true:
- Generated by a CI/CD tool (GitHub Actions, Jenkins, CircleCI, etc.)
- Reports build, test, or deployment status
- Typically automated with no human sender

Examples to Match:
- "Build #981 passed on main."
- "Production deployment failed—see logs."
- "Pipeline completed in 3 m 45 s."

Do NOT match if:
- Manual code review requests
- Security alerts about vulnerabilities
- Product release announcements to customers`
    },
    {
      id: 'security-alerts',
      name: 'Security Alerts',
      description: 'Security vulnerabilities and alerts',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Security Alerts'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Critical vulnerability found',
        'Dependency security update',
        'Access attempt blocked'
      ],
      prompt: `Match if ALL are true:
- Reports a potential security issue, breach, or vulnerability
- Comes from security tooling, vendor, or platform
- Requires attention or action to remediate risk

Examples to Match:
- "Critical CVE detected in openssl."
- "Unusual login attempt blocked."
- "Dependency X has a high‑severity vulnerability."

Do NOT match if:
- Generic marketing of security products
- Routine password‑change confirmations
- Build status emails without security context`
    },
    {
      id: 'tech-newsletters',
      name: 'Tech News',
      description: 'Technical newsletters and articles',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Tech News'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['JavaScript Weekly', 'Hacker News digest', 'GitHub trending repos'],
      prompt: `Match if ALL are true:
- Newsletter or digest covering technology topics
- Contains curated articles, repo links, or industry news
- Sent on a scheduled cadence

Examples to Match:
- "JavaScript Weekly—Issue #650."
- "Hacker Newsletter—Top stories this week."
- "Trending repositories on GitHub."

Do NOT match if:
- Vendor product promotions
- Personal outreach requiring a reply
- Security advisories (use Security Alerts)`
    }
  ],

  finance: [
    {
      id: 'account-alerts',
      name: 'Account Alerts',
      description: 'Important banking and account notifications',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Account Alerts'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Low balance warning', 'Unusual activity detected', 'Payment overdue'],
      prompt: `Match if ALL are true:
- Sent by a financial institution (bank, credit card, PayPal, etc.)
- Highlights account balance issues, fraud, or overdue payments
- Requires awareness or immediate action

Examples to Match:
- "Low balance alert—action recommended."
- "We detected unusual activity on your card."
- "Payment overdue—please settle your account."

Do NOT match if:
- Monthly statements (use Statements)
- Investment performance reports (use Investment Updates)
- Marketing offers or credit card promotions`
    },
    {
      id: 'investment-updates',
      name: 'Investment Updates',
      description: 'Portfolio and market notifications',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Investment Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Portfolio performance report',
        'Dividend payment received',
        'Market volatility alert'
      ],
      prompt: `Match if ALL are true:
- Relates to stocks, ETFs, crypto, or other investments
- Provides performance metrics, dividends, or market news
- Comes from a brokerage, robo‑advisor, or market service

Examples to Match:
- "Your portfolio is up 2 % today."
- "Dividend payment received—$25.40."
- "Market volatility alert: S&P 500 down 3 %."

Do NOT match if:
- Monthly account statements
- Banking balance alerts
- General finance newsletters`
    },
    {
      id: 'statements',
      name: 'Statements',
      description: 'Monthly statements and tax documents',
      color: { background: '#b6cff5', text: '#0d3472' },
      outputLabels: ['Mono/Statements'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Monthly credit card statement', 'Tax document available', 'Annual report ready'],
      prompt: `Match if ALL are true:
- Contains a formal statement or report PDF
- Sent on a monthly, quarterly, or annual schedule
- Includes account summary, transactions, or tax forms

Examples to Match:
- "Your January 2025 statement is ready."
- "Tax document: Form 1099 available for download."
- "Annual report for account ending 1234."

Do NOT match if:
- Fraud or low‑balance alerts
- Promotional finance offers
- Real‑time trading alerts`
    },
    {
      id: 'crypto',
      name: 'Crypto',
      description: 'Cryptocurrency and trading notifications',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Crypto'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Bitcoin price alert', 'Trade executed', 'Staking rewards earned'],
      prompt: `Match if ALL are true:
- Pertains to cryptocurrencies or blockchain assets
- Reports price movements, executed trades, or staking rewards
- Sent by an exchange, wallet, or crypto service

Examples to Match:
- "BTC has crossed $70 000."
- "Your order to buy 0.5 ETH was filled."
- "You earned 0.1 DOT in staking rewards."

Do NOT match if:
- Traditional stock or ETF updates
- Generic finance newsletters
- Security breach emails (use Security Alerts)`
    }
  ],

  learning: [
    {
      id: 'assignments',
      name: 'Assignments',
      description: 'Homework and project deadlines',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Assignments'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Assignment due tomorrow', 'Project submission reminder', 'Late work notice'],
      prompt: `Match if ALL are true:
- Sent by a professor, TA, or course platform
- Specifies an upcoming due date or overdue work
- Requires you to submit or complete an assignment

Examples to Match:
- "Homework 3 is due by 11:59 pm tonight."
- "Reminder: Project proposal submission tomorrow."
- "Your assignment is overdue—late penalty applies."

Do NOT match if:
- General course announcements without deadlines
- Grades or feedback (use Grades)
- Promotional emails from online course sites`
    },
    {
      id: 'course-updates',
      name: 'Course Updates',
      description: 'Class announcements and schedule changes',
      color: { background: '#b6cff5', text: '#0d3472' },
      outputLabels: ['Mono/Course Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Class cancelled today', 'New course material posted', 'Exam schedule updated'],
      prompt: `Match if ALL are true:
- Provides logistical information about a course
- Announcements such as cancellations, new material, or room changes
- Does not include graded feedback or due‑date reminders

Examples to Match:
- "Lecture cancelled due to instructor illness."
- "Slides for Week 5 uploaded."
- "Midterm moved to April 12."

Do NOT match if:
- Assignment due notices
- Grade postings
- Marketing for unrelated courses`
    },
    {
      id: 'grades',
      name: 'Grades',
      description: 'Test results and grade notifications',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Grades'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Quiz results available', 'Final grade posted', 'Assignment feedback ready'],
      prompt: `Match if ALL are true:
- Contains official score, grade, or feedback
- Sent by your instructor or learning platform
- References a completed assessment

Examples to Match:
- "Your quiz score: 18/20."
- "Final grade: A‑ for PHYS 137B."
- "Assignment feedback attached."

Do NOT match if:
- Upcoming assignment reminders
- General course announcements
- Promotional education content`
    },
    {
      id: 'learning-resources',
      name: 'Learning Resources',
      description: 'Educational content and tutorials',
      color: { background: '#e3d7ff', text: '#3d188e' },
      outputLabels: ['Mono/Learning Resources'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['New tutorial series', 'Free course available', 'Study guide published'],
      prompt: `Match if ALL are true:
- Shares optional learning materials or tutorials
- Notifies about free courses, guides, or reference articles
- No immediate deadline or grade impact

Examples to Match:
- "New Python tutorial series released."
- "Study guide for finals available here."
- "Free course: Introduction to Machine Learning."

Do NOT match if:
- Mandatory assignments or deadlines
- Grade announcements
- Marketing unrelated to education`
    }
  ],
  designer: [
    {
      id: 'design-updates',
      name: 'Design Updates',
      description:
        'Automated or teammate‑sent notifications about new Figma files, prototype iterations, or design‑system changes',
      color: { background: '#b6cff5', text: '#0d3472' },
      outputLabels: ['Mono/Design Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Figma file updated', 'New component added', 'Prototype iteration v3'],
      prompt: `Match if ALL are true:
- Email references a design tool (Figma, Sketch, Zeplin) OR mentions prototype / mock‑up updates
- Purpose is to inform about changed designs, not to request feedback
- No explicit deliverable or asset request

Examples to Match:
- "Updated Figma file for onboarding screens."
- "Design system token changes pushed to branch."
- "Prototype link refreshed—latest interactions added."

Do NOT match if:
- Sender asks for feedback or approval (use Design Review)
- Client is requesting new assets (use Asset Requests)
- General marketing collateral unrelated to active projects`
    },
    {
      id: 'design-review',
      name: 'Design Review',
      description: 'Requests for feedback or approval on design work',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Design Review'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Please review latest mockups', 'Feedback on prototype', 'Design review meeting'],
      prompt: `Match if ALL are true:
- Sender explicitly asks for design feedback, approval, or comments
- Email contains links / screenshots of mock‑ups, prototypes, or visual assets
- May propose design‑review meeting or async comments

Examples to Match:
- "Could you review the signup flow mock‑ups?"
- "Let me know if the color palette feels right."
- "Design review scheduled for Tuesday—see Figma link."

Do NOT match if:
- Purely informational update with no action required
- Asset or logo requests (use Asset Requests)
- Engineering pull requests (use Code Reviews)`
    },
    {
      id: 'asset-requests',
      name: 'Asset Requests',
      description: 'Emails asking for logos, icons, images, or brand assets',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Asset Requests'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Need logo in SVG', 'Requesting brand images', 'Hi‑res hero image?'],
      prompt: `Match if ALL are true:
- Sender requests design assets (logo, icon set, images, fonts, etc.)
- Specifies file type, resolution, or usage context
- Needs deliverable rather than feedback

Examples to Match:
- "Do you have the logo in SVG format?"
- "Marketing needs hero image at 4 K."
- "Please share the brand guideline PDF."

Do NOT match if:
- Feedback on existing designs
- Automated notifications from design tools
- Purchase orders or invoices`
    },
    {
      id: 'client-feedback',
      name: 'Client Feedback',
      description: 'External stakeholder comments and change requests on delivered designs',
      color: { background: '#e3d7ff', text: '#3d188e' },
      outputLabels: ['Mono/Client Feedback'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Logo feels too busy—can we simplify?',
        'Can we adjust spacing on the hero section?',
        'Color palette feedback from client'
      ],
      prompt: `Match if ALL are true:
- Sender is a client or external stakeholder (not internal team)
- Provides feedback, comments, or change requests on delivered designs
- References specific visual or UX elements and expects revisions or follow‑up

Examples to Match:
- "The CTA button should pop more—maybe try our brand orange?"
- "Great start, but the navigation feels crowded on mobile."
- "We like the direction—could you soften the edges on icons?"

Do NOT match if:
- They request new assets (use Asset Requests)
- Feedback comes from internal teammates (use Design Review)
- Automated notifications from design tools (use Design Updates)`
    }
  ],

  /* ─────────────────────── MARKETING SPACE ───────────────────── */
  marketing: [
    {
      id: 'newsletter-feedback',
      name: 'Newsletter Feedback',
      description: 'Subscriber replies or internal comments about sent newsletters',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Newsletter Feedback'],
      markAsDone: false,
      moveToTrash: false,
      examples: ["Loved today's issue", 'Broken link in newsletter', 'Unsubscribe request'],
      prompt: `Match if ALL are true:
- Email is a direct reply or comment about a newsletter you sent
- Mentions specific content, link, or issue in the campaign
- Typically comes from a subscriber or teammate, not an automated system

Examples to Match:
- "Great insights in this week's edition—thanks!"
- "The second link returns 404."
- "Please remove me from your mailing list."

Do NOT match if:
- Bulk performance reports from ESP (use Campaign Performance)
- General marketing discussions
- Automated list hygiene alerts`
    },
    {
      id: 'campaign-performance',
      name: 'Campaign Performance',
      description: 'Automated reports on opens, CTR, ROAS, or funnel metrics',
      color: { background: '#b6cff5', text: '#0d3472' },
      outputLabels: ['Mono/Campaign Performance'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Campaign performance dashboard', 'CTR dropped 10%', 'ROAS report attached'],
      prompt: `Match if ALL are true:
- Sent by an email/SMS ad platform (Mailchimp, Klaviyo, Meta Ads, Google Ads, etc.)
- Summarizes metrics such as opens, clicks, conversions, CPA, or ROAS
- May include CSV/PDF report attachments or dashboard screenshots

Examples to Match:
- "Your campaign had a 43 % open rate."
- "ROAS for Q2: 5.2×."
- "Daily performance report attached."

Do NOT match if:
- Subscriber replies to newsletters
- Product‑launch feedback from users
- Billing or invoice emails (use Tool Invoices)`
    },
    {
      id: 'launch-replies',
      name: 'Launch Replies',
      description: 'Inbound responses to a product launch or growth announcement',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Launch Replies'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Congrats on the launch!', 'How do I join beta?', 'Product Hunt comment'],
      prompt: `Match if ALL are true:
- Email references a public launch, Product Hunt post, press release, or announcement
- Sender expresses interest, questions, or congratulations
- Not an internal team thread

Examples to Match:
- "Saw you on Product Hunt—would love an invite."
- "Congrats on v1.0! How can we integrate?"
- "Great job on the launch!"

Do NOT match if:
- Internal launch coordination
- Automated campaign reports
- Marketing vendor pitches`
    },
    {
      id: 'vendor-pitches',
      name: 'Vendor Pitches',
      description: 'Cold outreach from marketing agencies, ad platforms, or tool vendors',
      color: { background: '#b3efd3', text: '#04502e' },
      outputLabels: ['Mono/Vendor Pitches'],
      markAsDone: false,
      moveToTrash: true,
      examples: [
        'Boost your app on TikTok—get 1 M views!',
        'Influencer agency proposal',
        'We can 10× your growth with AI ads'
      ],
      prompt: `Match if ALL are true:
- Sender is unknown (agency, freelancer, SaaS, or tool vendor)
- Offering marketing services, sponsorships, or paid tools
- Email is unsolicited cold outreach or upsell

Examples to Match:
- "Partner with us to reach Gen‑Z on Snapchat."
- "Our AI copy tool can triple your CTR—book a demo."
- "10 K newsletter subscribers ready to promote your product."

Do NOT match if:
- Replies to your campaigns or launch (use Launch Replies)
- Internal discussions about marketing strategy
- Campaign performance reports (use Campaign Performance)`
    }
  ],

  /* ───────────────────────── ADMIN SPACE ─────────────────────── */
  admin: [
    {
      id: 'tool-invoices',
      name: 'Tool Invoices',
      description: 'Receipts and invoices from SaaS or internal tools',
      color: { background: '#b3efd3', text: '#04502e' },
      outputLabels: ['Mono/Tool Invoices'],
      markAsDone: true,
      moveToTrash: false,
      examples: ['Your invoice is ready', 'Receipt for payment', 'Billing statement'],
      prompt: `Match if ALL are true:
- Sent by a SaaS vendor or internal billing system
- Confirms payment, invoice availability, or subscription renewal
- Includes amount due/paid, billing period, or invoice PDF

Examples to Match:
- "Invoice #9981 for Slack due May 31."
- "Your payment of $49 has been processed."
- "AWS usage charge—statement attached."

Do NOT match if:
- Policy or HR updates
- Access or permission requests
- Security alerts about payment cards`
    },
    {
      id: 'policy-updates',
      name: 'Policy Updates',
      description: 'HR, legal, or operational policy change notifications',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Policy Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Updated vacation policy', 'New security guidelines', 'Terms of Service changes'],
      prompt: `Match if ALL are true:
- Communicates changes to company policies, legal terms, or compliance
- Typically sent by HR, legal, or security teams
- Informational—may require acknowledgment but not payment

Examples to Match:
- "We've updated our privacy policy—please review."
- "New remote‑work guidelines effective July 1."
- "Security policy v3.2 is now in effect."

Do NOT match if:
- Invoices or billing
- Routine IT requests
- Marketing communications`
    },
    {
      id: 'access-requests',
      name: 'Access Requests',
      description: 'Requests to grant or revoke access to tools or data',
      color: { background: '#c9daf8', text: '#1c4587' },
      outputLabels: ['Mono/Access Requests'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Requesting GitHub access', 'Please add to Figma', 'Need database permissions'],
      prompt: `Match if ALL are true:
- Sender asks for account creation, role change, or permission update
- Targets internal tool, repo, or SaaS platform
- Requires you (or IT) to approve or provision access

Examples to Match:
- "Could you add me to the GitHub org?"
- "Please grant read‑only access to the analytics DB."
- "Remove John's access to Figma."

Do NOT match if:
- Security alerts about unauthorized access
- Billing or invoice notifications
- Policy announcements`
    },
    {
      id: 'hr-notices',
      name: 'HR Notices',
      description: 'Human‑resources announcements, benefits, payroll, and compliance reminders',
      color: { background: '#e3d7ff', text: '#3d188e' },
      outputLabels: ['Mono/HR Notices'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Open enrollment starts next week',
        'Payroll schedule updated',
        'Mandatory compliance training reminder'
      ],
      prompt: `Match if ALL are true:
- Sent by HR, benefits, or payroll departments/platforms
- Relates to benefits enrollment, payroll timing, or compliance training
- Informational or requires acknowledgment, not payment

Examples to Match:
- "Benefits open enrollment window: Oct 1–15."
- "Payroll will be processed early due to holiday."
- "Complete the cybersecurity training by Friday."

Do NOT match if:
- Company‑wide policy documents (use Policy Updates)
- Vendor or SaaS invoices (use Tool Invoices)
- Access provisioning requests (use Access Requests)`
    }
  ],

  /* ─────────────────────── NEWSLETTERS SPACE ─────────────────── */
  newsletters: [
    {
      id: 'digest',
      name: 'Digest',
      description: 'Daily or weekly digests from publications or communities',
      color: { background: '#e3d7ff', text: '#3d188e' },
      outputLabels: ['Mono/Digest'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Substack digest', 'Daily roundup', 'Weekend briefing'],
      prompt: `Match if ALL are true:
- Periodic email summarizing articles, links, or discussions
- Sent by a publication, community, or Substack author
- Usually labeled as "Daily/Weekly Digest" or similar

Examples to Match:
- "Weekend Briefing—Issue #210."
- "Daily Substack roundup for Tuesday."
- "Community highlights: top posts this week."

Do NOT match if:
- Single long‑form newsletter article
- Marketing promotions or sales
- Transactional receipts`
    },
    {
      id: 'blog-updates',
      name: 'Blog Updates',
      description: 'Notifications of new blog posts from followed sites',
      color: { background: '#b9e4d0', text: '#076239' },
      outputLabels: ['Mono/Blog Updates'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['New blog post', 'Article published', 'Latest from our blog'],
      prompt: `Match if ALL are true:
- Announces publication of a single new blog post or article
- Includes title, excerpt, or "Read more" link
- Sent by a blogging platform (WordPress, Ghost, Medium, etc.)

Examples to Match:
- "New post: Understanding Async/Await."
- "Article published on the company blog."
- "Latest from our blog—May update."

Do NOT match if:
- Aggregated digests (use Digest)
- Promotional e‑commerce content
- Personal or client emails needing reply`
    },
    {
      id: 'saved-articles',
      name: 'Saved Articles',
      description: 'Read‑later or bookmarking services sending saved links',
      color: { background: '#fce8b3', text: '#594c05' },
      outputLabels: ['Mono/Saved Articles'],
      markAsDone: false,
      moveToTrash: false,
      examples: ['Pocket saves', 'Instapaper daily', 'Readwise highlights'],
      prompt: `Match if ALL are true:
- Sent by a read‑later tool (Pocket, Instapaper, Matter, Readwise, etc.)
- Contains list of articles or highlights you saved
- Purely informational, no action required

Examples to Match:
- "Your Instapaper Daily—6 articles."
- "Pocket: Here are today's saves."
- "Readwise: 30 new Kindle highlights imported."

Do NOT match if:
- Promotional digests from unrelated brands
- Personal newsletters you subscribed to
- Security or account alerts`
    },
    {
      id: 'feature-article',
      name: 'Feature Article',
      description: 'Single long‑form newsletter articles from individual writers or publications',
      color: { background: '#f6c5be', text: '#ac2b16' },
      outputLabels: ['Mono/Feature Article'],
      markAsDone: false,
      moveToTrash: false,
      examples: [
        'Deep dive: AI in 2025',
        "Weekend essay: Remote work's future",
        'Macro Memo – May issue'
      ],
      prompt: `Match if ALL are true:
- Email contains one full‑length editorial or essay (not a digest)
- Sent by an individual writer or publication (e.g., Substack, Ghost)
- Focus is reading the article, no summary of multiple links

Examples to Match:
- "Stratechery: NVIDIA's Next Act."
- "The Diff — Why semiconductors matter more than oil."
- "No Mercy / No Malice: Game‑Over."

Do NOT match if:
- Aggregated digests (use Digest)
- Blog post announcements from your own site (use Blog Updates)
- Saved‑article lists from read‑later tools (use Saved Articles)`
    }
  ]
};
export interface MockEmail {
  subject: string;
  sender: string;
  filter: string; // one of that space's AI filter IDs
  isNew: boolean;
  time: string;
}

export const generateMockEmails = (templateId: string): MockEmail[] => {
  const emailsBySpace: Record<string, Omit<MockEmail, 'id' | 'time' | 'isNew'>[]> = {
    /* ─────────── WORK ─────────── */
    work: [
      {
        subject: 'Can you review this proposal by EOD?',
        sender: 'sarah@company.com',
        filter: 'needs-reply'
      },
      {
        subject: 'Quick question about the project timeline',
        sender: 'john@client.com',
        filter: 'needs-reply'
      },
      {
        subject: 'Exclusive software deal – 40 % off!',
        sender: 'sales@randomtech.com',
        filter: 'cold-outreach'
      },
      {
        subject: 'Team stand‑up – Friday 2 PM',
        sender: 'calendar@company.com',
        filter: 'meetings'
      },
      {
        subject: 'Sprint planning meeting moved to Monday',
        sender: 'pm@company.com',
        filter: 'meetings'
      },
      {
        subject: 'Q4 goals and planning session',
        sender: 'team@company.com',
        filter: 'team-updates'
      }
    ],

    /* ───────── PERSONAL ───────── */
    personal: [
      {
        subject: '50 % off everything – limited time!',
        sender: 'deals@store.com',
        filter: 'promotions'
      },
      {
        subject: 'Black Friday mega sale starts now!',
        sender: 'marketing@retailer.com',
        filter: 'promotions'
      },
      {
        subject: 'Your Amazon order has shipped',
        sender: 'ship-confirm@amazon.com',
        filter: 'transactional'
      },
      {
        subject: 'Thanks for your recent purchase',
        sender: 'receipt@store.com',
        filter: 'transactional'
      },
      {
        subject: 'Morning Brew: Tech layoffs continue',
        sender: 'crew@morningbrew.com',
        filter: 'newsletters'
      },
      { subject: 'Family BBQ this weekend!', sender: 'mom@family.com', filter: 'family-friends' }
    ],

    /* ─────── DEVELOPMENT ─────── */
    development: [
      {
        subject: '[PR] Fix authentication bug #1234',
        sender: 'github@company.com',
        filter: 'code-reviews'
      },
      {
        subject: 'Failed: Production deployment rollback',
        sender: 'alerts@company.com',
        filter: 'deployments'
      },
      {
        subject: 'Build #456 deployed successfully',
        sender: 'ci@company.com',
        filter: 'deployments'
      },
      {
        subject: 'Critical: SQL injection vulnerability found',
        sender: 'security@scanner.com',
        filter: 'security-alerts'
      },
      {
        subject: 'New security patch available',
        sender: 'security@vendor.com',
        filter: 'security-alerts'
      },
      {
        subject: 'JavaScript Weekly #124',
        sender: 'peter@javascriptweekly.com',
        filter: 'tech-newsletters'
      }
    ],

    /* ────────── FINANCE ───────── */
    finance: [
      {
        subject: 'Low balance alert – $45.20 remaining',
        sender: 'alerts@bank.com',
        filter: 'account-alerts'
      },
      { subject: 'Unusual spending detected', sender: 'fraud@bank.com', filter: 'account-alerts' },
      {
        subject: 'Your portfolio gained 2.4 % this week',
        sender: 'reports@investment.com',
        filter: 'investment-updates'
      },
      { subject: 'Bitcoin hits new monthly high', sender: 'alerts@crypto.com', filter: 'crypto' },
      {
        subject: 'March credit‑card statement ready',
        sender: 'statements@creditcard.com',
        filter: 'statements'
      },
      { subject: 'Tax documents now available', sender: 'tax@bank.com', filter: 'statements' }
    ],

    /* ────────── LEARNING ──────── */
    learning: [
      {
        subject: 'Assignment due: React components project',
        sender: 'prof@university.edu',
        filter: 'assignments'
      },
      {
        subject: 'Final project presentation next week',
        sender: 'prof@university.edu',
        filter: 'assignments'
      },
      {
        subject: 'Class cancelled – Professor sick',
        sender: 'admin@university.edu',
        filter: 'course-updates'
      },
      { subject: 'Midterm grades posted', sender: 'grades@university.edu', filter: 'grades' },
      {
        subject: 'Free React course: Advanced Patterns',
        sender: 'team@education.com',
        filter: 'learning-resources'
      },
      {
        subject: 'New study materials uploaded',
        sender: 'resources@university.edu',
        filter: 'learning-resources'
      }
    ],

    /* ───────── DESIGNER ───────── */
    designer: [
      {
        subject: 'Updated Figma file: onboarding screens v2',
        sender: 'no-reply@figma.com',
        filter: 'design-updates'
      },
      {
        subject: 'Prototype interaction tweaks pushed',
        sender: 'notifications@figma.com',
        filter: 'design-updates'
      },
      {
        subject: 'Please review new landing‑page mock‑ups',
        sender: 'alice@agency.com',
        filter: 'design-review'
      },
      {
        subject: 'Feedback: Typography feels too tight',
        sender: 'bob@client.com',
        filter: 'design-review'
      },
      {
        subject: 'Need high‑res logo in SVG',
        sender: 'marketing@startup.com',
        filter: 'asset-requests'
      },
      {
        subject: 'Logo feels too busy—can we simplify it?',
        sender: 'client@brand.com',
        filter: 'client-feedback'
      }
    ],

    /* ──────── MARKETING ───────── */
    marketing: [
      {
        subject: "Loved today's newsletter – great tips!",
        sender: 'jane@subscriber.com',
        filter: 'newsletter-feedback'
      },
      {
        subject: "Broken link in this week's newsletter",
        sender: 'mark@reader.io',
        filter: 'newsletter-feedback'
      },
      {
        subject: 'Daily performance: Open rate 42 %',
        sender: 'reports@mailchimp.com',
        filter: 'campaign-performance'
      },
      {
        subject: 'CTR dropped 10 % yesterday',
        sender: 'alerts@klaviyo.com',
        filter: 'campaign-performance'
      },
      {
        subject: 'Congrats on launch! How do I access beta?',
        sender: 'phuser@gmail.com',
        filter: 'launch-replies'
      },
      {
        subject: '10× your growth with AI‑powered ads',
        sender: 'sales@adwizard.ai',
        filter: 'vendor-pitches'
      }
    ],

    /* ─────────── ADMIN ────────── */
    admin: [
      {
        subject: 'Invoice #10234 for Slack is ready',
        sender: 'billing@slack.com',
        filter: 'tool-invoices'
      },
      {
        subject: 'Your payment of $49 has been processed',
        sender: 'receipts@stripe.com',
        filter: 'tool-invoices'
      },
      {
        subject: 'Updated expense reimbursement policy',
        sender: 'hr@company.com',
        filter: 'policy-updates'
      },
      {
        subject: 'Remote‑work policy v2 goes live Monday',
        sender: 'legal@company.com',
        filter: 'policy-updates'
      },
      {
        subject: 'Please add me to the analytics DB',
        sender: 'daniel@company.com',
        filter: 'access-requests'
      },
      {
        subject: 'Open enrollment starts next week',
        sender: 'benefits@company.com',
        filter: 'hr-notices'
      }
    ],

    /* ───────── NEWSLETTERS ────── */
    newsletters: [
      {
        subject: 'Weekend Briefing – Issue #212',
        sender: 'briefing@substack.com',
        filter: 'digest'
      },
      {
        subject: 'Community highlights: May top stories',
        sender: 'digest@forum.com',
        filter: 'digest'
      },
      {
        subject: 'New post: Scaling WebSockets to millions',
        sender: 'blog@company.dev',
        filter: 'blog-updates'
      },
      {
        subject: 'Latest from our blog – April update',
        sender: 'hello@company.com',
        filter: 'blog-updates'
      },
      {
        subject: 'Your Instapaper Daily – 7 new articles',
        sender: 'no-reply@instapaper.com',
        filter: 'saved-articles'
      },
      {
        subject: "Stratechery: NVIDIA's Next Act",
        sender: 'ben@stratechery.com',
        filter: 'feature-article'
      }
    ]
  };

  return (emailsBySpace[templateId as keyof typeof emailsBySpace] || emailsBySpace.work).map(
    (email, index) => ({
      ...email,
      id: index,
      time: `${Math.floor(Math.random() * 12) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`,
      isNew: Math.random() > 0.7
    })
  );
};
