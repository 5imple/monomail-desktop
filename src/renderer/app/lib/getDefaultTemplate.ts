import { IMonoTemplate } from '@/main/api/template/types';
import { generateUUID } from '@/main/utils';
import { plainTextToHtml } from '@/renderer/app/lib/plainTextToHtml';

export const ALL_TEMPLATES: IMonoTemplate[] = [
  /*
   * ========================
   *  SNIPPETS (Short, Insertable Blocks)
   * ========================
   */
  {
    // id: 'snippet_1',
    id: generateUUID(),
    name: 'Schedule',
    icon: 'Calendar',
    body: plainTextToHtml(
      `Hi {first_name},\n\nI'd love to find a time to connect. Here's my availability: {calendar_link}.`
    )
  },
  {
    // id: 'snippet_2',
    id: generateUUID(),
    name: 'Follow-Up',
    icon: 'Star',
    body: plainTextToHtml(
      `Hi {first_name},\n\nJust following up on my last email. Let me know if you have any thoughts!`
    )
  },
  {
    // id: 'snippet_3',
    id: generateUUID(),
    name: 'Thanks',
    icon: 'Heart',
    body: plainTextToHtml(
      `Thanks again for your time, {first_name} — really appreciated the conversation.`
    )
  },
  {
    // id: 'snippet_11',
    id: generateUUID(),
    name: 'Submission',
    icon: 'CheckCircle',
    body: plainTextToHtml(
      `Hi {first_name},\n\nAs discussed, I've attached the document for your review. It includes:\n- {section_1}\n- {section_2}\n- {section_3}\n\nI'd love to walk you through it if you'd like to set up a time. Otherwise, feel free to leave comments directly and I'll follow up accordingly.\n\nLooking forward to hearing your thoughts.\n\nBest regards,\n{your_name}`
    )
  },
  {
    // id: 'snippet_13',
    id: generateUUID(),
    name: 'Outreach',
    icon: 'Envelope',
    body: plainTextToHtml(
      `Hi {first_name},\n\nI came across your work on {context — e.g., LinkedIn, a blog post, a mutual connection}, and was really impressed by {something specific}.\n\nI'm currently working on {your_project_or_product}, which I think could align well with what you're doing at {company_name}. If you're open to a quick 15-min chat, I'd love to share more and get your thoughts.\n\nHere's my availability: {calendly_link}\n\nLooking forward to connecting!\n\n{your_name}`
    )
  },
  /*
   * ========================
   *  LONG TEMPLATES
   * ========================
   */
  {
    // id: 'long_1',
    id: generateUUID(),
    name: 'Meeting Note',
    icon: 'Pen',
    // subject: 'Follow-Up on Our Meeting – {Topic}',
    body: plainTextToHtml(
      `Hi {first_name},\n\nThank you for meeting with me to discuss {topic/project}. I found our conversation very insightful, particularly regarding:\n- {key_point_1}\n- {key_point_2}\n- {key_point_3}\n\nBased on what we discussed, here are the proposed action items:\n1. {action_item_1} – Owner: {assigned_person}, Deadline: {due_date}\n2. {action_item_2} – Owner: {assigned_person}, Deadline: {due_date}\n3. {action_item_3} – Owner: {assigned_person}, Deadline: {due_date}\n\nLet me know if these align with your expectations or if there's anything you'd like to adjust. I appreciate your time and look forward to our continued collaboration.\n\nBest regards,\n{your_name}`
    )
  },
  {
    // id: 'long_3',
    id: generateUUID(),
    name: 'Re-Engagement',
    icon: 'RotateCcw',
    // subject: 'Reconnecting About {Project/Topic}',
    body: plainTextToHtml(
      `Hi {first_name},\n\nI hope you're doing well! It's been a while since we last spoke about {topic}, and I wanted to circle back. Since our previous conversation, I've made significant progress on:\n- {update_1}\n- {update_2}\n\nI'd love to see if there's still an opportunity to collaborate or pick up where we left off. If you're open to it, please let me know a few times that work for you, or feel free to use my calendar link here: {calendar_link}.\n\nLooking forward to catching up!\n\nBest,\n{your_name}`
    )
  }
];
