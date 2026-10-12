export const MESSAGE_TEMPLATES = [
  {
    id: "welcome",
    name: "Welcome Message",
    description: "Introduce Tameer.ai and share download links.",
    body: `Welcome to Tameer.ai!
Pakistan's first zero-commission construction platform. Everything construction, in one app:

🏢 Builders, contractors, architects & construction companies
🧱 Materials, suppliers & manufacturers
🔧 Skilled labour

Browse, compare & contact directly.
✅ No middlemen. ✅ No commission.

📲 Download Free:

🍎 iPhone: https://apps.apple.com/pk/app/tameer-ai/id6762259812
🤖 Android: https://play.google.com/store/apps/details?id=com.tameerai.mobile
🌐 Website: https://www.tameer.ai

Tameer.ai - Building Connections. Building Pakistan. 🇵🇰`
  },
  {
    id: "social",
    name: "Follow us on Social Media",
    description: "Share Tameer.ai social media profiles.",
    body: `👋 *Stay Connected with Tameer.ai!*

Follow us on social media for the latest construction trends, updates, opportunities, and everything happening at *Tameer.ai* 🏗️

📸 *Instagram:* https://www.instagram.com/tameer.ai
📘 *Facebook:* https://www.facebook.com/profile.php?id=61581381658699
▶️ *YouTube:* https://www.youtube.com/@tameer_ai
💼 *LinkedIn:* https://www.linkedin.com/company/tameer-ai/posts

🌐 *Tameer.ai - Building Connections. Building Pakistan.* 🇵🇰`
  },
  {
    id: "list-business",
    name: "List your business",
    description: "Ask a business to create or share profile details.",
    body: `Create your business profile in just a few minutes:

📱 *Android:* https://play.google.com/store/apps/details?id=com.tameerai.mobile
🍎 *iPhone:* https://apps.apple.com/pk/app/tameer-ai/id6762259812

*Want us to create it for you?* Simply send:

1. Logo
2. Company Name
3. Email
4. Phone / WhatsApp
5. Address
6. Social Media Links

📈 See how Tameer.ai can help you get leads:
https://www.instagram.com/p/DbI-awLtcA_/

*Team Tameer.ai*`
  }
];

export function findMessageTemplate(templateId) {
  return MESSAGE_TEMPLATES.find((template) => template.id === templateId) || null;
}
