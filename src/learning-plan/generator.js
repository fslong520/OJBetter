/**
 * 学习计划生成器 - 纯本地分析（不使用 AI 对话）
 */
import { getHistory, extractTopic } from '../storage/history.js';

class LearningPlanGenerator {
  async analyzeHistory() {
    const history = await getHistory();
    if (history.length === 0) return null;

    const topicCount = {};
    const topicHintLevels = {};

    history.forEach(entry => {
      const topic = entry.topic || extractTopic(entry.question || '');
      topicCount[topic] = (topicCount[topic] || 0) + 1;
      if (!topicHintLevels[topic]) topicHintLevels[topic] = [];
      topicHintLevels[topic].push(entry.hintLevel || 2);
    });

    const weakTopics = [];
    for (const [topic, levels] of Object.entries(topicHintLevels)) {
      const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
      weakTopics.push({
        topic,
        count: topicCount[topic],
        avgHintLevel: Math.round(avgLevel * 10) / 10,
        weakness: avgLevel > 2.5 ? 'high' : avgLevel > 2 ? 'medium' : 'low'
      });
    }

    weakTopics.sort((a, b) => b.avgHintLevel - a.avgHintLevel);

    const sortedTopics = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);

    return {
      totalQuestions: history.length,
      weakTopics,
      mostAskedTopics: sortedTopics,
      firstQuestion: history[history.length - 1]?.timestamp || 0,
      lastQuestion: history[0]?.timestamp || 0
    };
  }

  async generatePlan() {
    const analysis = await this.analyzeHistory();

    if (!analysis) {
      return {
        title: '开始你的编程之旅吧！',
        summary: '还没有提问记录，先试着让小智帮你分析一道题吧！',
        weeklyPlan: [{ day: '第一步', task: '找一道编程题，选中文字右键让"小智"帮你' }],
        tips: ['遇到问题先自己思考 10 分钟', '用纸笔画出你的思路', '多问"为什么"']
      };
    }

    const { weakTopics, mostAskedTopics, totalQuestions } = analysis;
    const plan = {
      title: totalQuestions > 10 ? '个性化学习计划' : '入门学习建议',
      summary: '',
      weeklyPlan: [],
      tips: ['遇到问题先自己思考 10 分钟再寻求提示', '拿到提示后尝试自己写代码', '做错的题目隔一天再试一次']
    };

    if (weakTopics.length > 0 && weakTopics[0].weakness !== 'low') {
      plan.summary = `你在「${weakTopics[0].topic}」上需要更多练习，平均提示深度达到了 ${weakTopics[0].avgHintLevel}（越高说明越需要帮助）。`;
      plan.weeklyPlan.push({
        day: '本周重点',
        task: `巩固「${weakTopics[0].topic}」的基础概念，找 3 道类似题目练习`
      });
    } else {
      plan.summary = `你已经获得过 ${totalQuestions} 次提示了，很不错！继续保持探索精神。`;
    }

    if (weakTopics.length > 1) {
      weakTopics.slice(1, 3).forEach((wt, i) => {
        if (wt.count >= 2) {
          plan.weeklyPlan.push({
            day: `第${i + 1}天`,
            task: `复习「${wt.topic}」相关题目`
          });
        }
      });
    }

    if (mostAskedTopics.length > 0) {
      plan.summary += `\n你最常练习的方向是：${mostAskedTopics.slice(0, 3).join('、')}。`;
      if (plan.weeklyPlan.length < 3) {
        plan.weeklyPlan.push({
          day: '挑战日',
          task: `在「${mostAskedTopics[0]}」上找一道更难的题目挑战自己`
        });
      }
    }

    plan.tips.push('每隔几天回顾一下之前不会的题目');
    return plan;
  }
}

const learningPlanGenerator = new LearningPlanGenerator();
export { learningPlanGenerator, LearningPlanGenerator };
