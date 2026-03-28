import { useTranslation } from 'react-i18next';

// Alternative approach: Create a hook for plan details
export const usePlanDetails = () => {
  const { t } = useTranslation();

  const planDetailsSandbox = {
    free: {
      id: 'free-plan',
      name: t('plan_selection.plans.free.name'),
      description: t('plan_selection.plans.free.description'),
      productId: 'free',
      monthly: { price: 'Free' },
      annually: { price: 'Free' },
      features: [
        t('plan_selection.plans.free.features.basic_email'),
        t('plan_selection.plans.free.features.single_account'),
        t('plan_selection.plans.free.features.history')
      ]
    },
    plus: {
      id: 'e586cefe-2539-42a0-80d9-91bda11a19d5',
      name: t('plan_selection.plans.plus.name'),
      description: t('plan_selection.plans.plus.description'),
      productId: '467649',
      monthly: { price: '$5' },
      annually: { price: '$4' },
      features: [
        t('plan_selection.plans.plus.features.accounts'),
        t('plan_selection.plans.plus.features.spaces'),
        t('plan_selection.plans.plus.features.history')
      ]
    },
    pro: {
      id: '9be9bef6-9ab8-4b2d-9e68-6d5107fb8092',
      name: t('plan_selection.plans.pro.name'),
      description: t('plan_selection.plans.pro.description'),
      productId: '467672',
      monthly: { price: '$20' },
      annually: { price: '$16' },
      features: [
        t('plan_selection.plans.pro.features.ai'),
        t('plan_selection.plans.pro.features.offline'),
        t('plan_selection.plans.pro.features.support'),
        t('plan_selection.plans.plus.features.tracker')
      ]
    },
    plus_onetime: {
      id: '0efc3f75-6ace-42d4-8fc4-fbd2b2092f8c',
      name: t('plan_selection.plans.plus_onetime.name'),
      description: t('plan_selection.plans.plus_onetime.description'),
      productId: '489691', // Sandbox product ID for one-time payment
      onetime: { price: '$96' },
      features: [
        t('plan_selection.plans.plus.features.accounts'),
        t('plan_selection.plans.plus.features.spaces'),
        t('plan_selection.plans.plus.features.history'),
        t('plan_selection.plans.plus.features.tracker'),
        t('plan_selection.plans.plus_onetime.features.lifetime_access')
      ]
    }
  };

  const planDetailsProduction = {
    free: {
      id: 'free-plan',
      name: t('plan_selection.plans.free.name'),
      description: t('plan_selection.plans.free.description'),
      productId: 'free',
      monthly: { price: 'Free' },
      annually: { price: 'Free' },
      features: [
        t('plan_selection.plans.free.features.basic_email'),
        t('plan_selection.plans.free.features.single_account'),
        t('plan_selection.plans.free.features.essential_features')
      ]
    },
    plus: {
      id: '2710b687-5616-4398-89ae-5fb8da44ca65',
      name: t('plan_selection.plans.plus.name'),
      description: t('plan_selection.plans.plus.description'),
      productId: '500803',
      monthly: { price: '$5' },
      annually: { price: '$4' },
      features: [
        t('plan_selection.plans.plus.features.accounts'),
        t('plan_selection.plans.plus.features.spaces'),
        t('plan_selection.plans.plus.features.history'),
        t('plan_selection.plans.plus.features.tracker')
      ]
    },
    pro: {
      id: '7114d3fa-4ce8-4c7e-888f-8172e45c745c',
      name: t('plan_selection.plans.pro.name'),
      description: t('plan_selection.plans.pro.description'),
      productId: '500804',
      monthly: { price: '$20' },
      annually: { price: '$16' },
      features: [
        t('plan_selection.plans.pro.features.ai'),
        t('plan_selection.plans.pro.features.offline'),
        t('plan_selection.plans.pro.features.support')
      ]
    },
    plus_onetime: {
      id: 'a15c1acf-9550-45c4-9b99-ed06f7981d62',
      name: t('plan_selection.plans.plus_onetime.name'),
      description: t('plan_selection.plans.plus_onetime.description'),
      productId: '586268', // Production product ID for one-time payment
      onetime: { price: '$96' },
      features: [
        t('plan_selection.plans.plus.features.accounts'),
        t('plan_selection.plans.plus.features.spaces'),
        t('plan_selection.plans.plus.features.history'),
        t('plan_selection.plans.plus.features.tracker'),
        t('plan_selection.plans.plus_onetime.features.lifetime_access')
      ]
    }
  };

  return import.meta.env.MONO_ENV_APP_VERSION.includes('dev')
    ? planDetailsSandbox
    : planDetailsProduction;
};
