import { generateUUID } from '@/main/utils';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle
} from '@/renderer/app/components/ui/dialog';
import { Input } from '@/renderer/app/components/ui/input';
import { Switch } from '@/renderer/app/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { BUILT_IN_TAB_RULES } from '@/renderer/app/lib/filterTabOrder';
import {
  isRuleComplete,
  sameFilters,
  threadMatchesFilters
} from '@/renderer/app/lib/threadFilters';
import {
  SPLIT_COLORS,
  SPLIT_COLOR_BG,
  isSplitColor,
  nextSplitColor,
  type SplitColor
} from '@/renderer/app/lib/splitColors';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import {
  customLabelEditorAtom,
  customLabelsAtom,
  type CustomLabel
} from '@/renderer/app/store/thread/atoms';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import type { FilterCriteria, FilterType } from '@/renderer/app/types';
import { useAtom } from 'jotai';
import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Operator = FilterCriteria['operator'];

interface FieldConfig {
  type: FilterType;
  label: string;
  operators: { operator: Operator; label: string }[];
  /** text: a typed value; choice: one of `choices`; none: the operator says it all. */
  input: 'text' | 'choice' | 'none';
  choices?: { value: string; label: string }[];
  placeholder?: string;
}

const EMPTY_RULE: FilterCriteria = { type: 'from', operator: 'contains', value: '' };

function useFieldConfigs(): FieldConfig[] {
  const { t } = useTranslation();
  const { getUniqueCustomLabelNames } = useLabelAtom();
  const labelNames = useMemo(() => getUniqueCustomLabelNames(), [getUniqueCustomLabelNames]);

  const contains = [
    { operator: 'contains' as const, label: t('filter.custom.contains', 'contains') },
    {
      operator: 'does_not_contain' as const,
      label: t('filter.custom.does_not_contain', "doesn't contain")
    }
  ];
  const hasOne = [
    { operator: 'has' as const, label: t('filter.custom.has_one', 'yes') },
    { operator: 'does_not_have' as const, label: t('filter.custom.has_none', 'no') }
  ];
  const is = [{ operator: 'is' as const, label: t('filter.custom.is', 'is') }];

  const fields: FieldConfig[] = [
    {
      type: 'from',
      label: t('filter.custom.from', 'From'),
      operators: contains,
      input: 'text',
      placeholder: t('filter.custom.person_placeholder', 'Name, email or @domain')
    },
    {
      type: 'to',
      label: t('filter.custom.to', 'Sent to (To or Cc)'),
      operators: contains,
      input: 'text',
      placeholder: t('filter.custom.person_placeholder', 'Name, email or @domain')
    },
    {
      type: 'subject',
      label: t('filter.custom.subject', 'Subject'),
      operators: contains,
      input: 'text',
      placeholder: t('filter.custom.subject_placeholder', 'Words in the subject')
    },
    {
      type: 'read_status',
      label: t('filter.custom.status', 'Status'),
      operators: is,
      input: 'choice',
      choices: [
        { value: 'unread', label: t('filter.unread', 'Unread') },
        { value: 'read', label: t('filter.read', 'Read') }
      ]
    },
    {
      type: 'attachment',
      label: t('filter.custom.attachment', 'Has attachment'),
      operators: hasOne,
      input: 'none'
    },
    {
      type: 'calendar',
      label: t('filter.custom.calendar', 'Has calendar invite'),
      operators: hasOne,
      input: 'none'
    },
    {
      type: 'team',
      label: t('filter.custom.team', 'From my team (domain)'),
      operators: is,
      input: 'text',
      placeholder: t('filter.custom.team_placeholder', 'example.edu')
    },
    {
      type: 'inbox_type',
      label: t('filter.custom.inbox_type', 'Focused Inbox'),
      operators: is,
      input: 'choice',
      choices: [
        { value: 'other', label: t('filter.custom.other', 'Other') },
        { value: 'focused', label: t('filter.custom.focused', 'Focused') }
      ]
    },
    {
      type: 'date',
      label: t('filter.custom.date', 'Received'),
      operators: is,
      input: 'choice',
      choices: [
        { value: 'today', label: t('filter.today', 'Today') },
        { value: 'yesterday', label: t('filter.yesterday', 'Yesterday') },
        { value: 'this_week', label: t('filter.this_week', 'This week') },
        { value: 'this_month', label: t('filter.this_month', 'This month') }
      ]
    }
  ];
  if (labelNames.length > 0) {
    fields.push({
      type: 'label',
      label: t('filter.custom.folder_label', 'Label'),
      operators: [
        { operator: 'contains', label: t('filter.custom.is', 'is') },
        { operator: 'does_not_contain', label: t('filter.custom.is_not', 'is not') }
      ],
      input: 'choice',
      choices: labelNames.map((name) => ({ value: name, label: name }))
    });
  }
  return fields;
}

/** A fresh rule for a field: its first operator, and its first choice if it has choices. */
function ruleForField(field: FieldConfig): FilterCriteria {
  return {
    type: field.type,
    operator: field.operators[0].operator,
    value:
      field.input === 'choice' ? field.choices?.[0]?.value : field.input === 'text' ? '' : undefined
  };
}

const RuleRow: FC<{
  rule: FilterCriteria;
  fields: FieldConfig[];
  onChange: (rule: FilterCriteria) => void;
  onRemove?: () => void;
  autoFocus?: boolean;
}> = ({ rule, fields, onChange, onRemove, autoFocus }) => {
  const { t } = useTranslation();
  const field = fields.find((f) => f.type === rule.type) ?? fields[0];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={field.type}
        onValueChange={(type) => {
          const next = fields.find((f) => f.type === type);
          if (next) onChange(ruleForField(next));
        }}
      >
        <SelectTrigger
          className="h-9 w-48 shrink-0 text-sm"
          aria-label={t('filter.custom.field', 'Field')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="dark">
          {fields.map((f) => (
            <SelectItem key={f.type} value={f.type}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {field.operators.length > 1 ? (
        <Select
          value={rule.operator}
          onValueChange={(operator) => onChange({ ...rule, operator: operator as Operator })}
        >
          <SelectTrigger
            className="h-9 w-36 shrink-0 text-sm"
            aria-label={t('filter.custom.condition', 'Condition')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark">
            {field.operators.map((op) => (
              <SelectItem key={op.operator} value={op.operator}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="w-36 shrink-0 px-3 text-sm text-muted-foreground">
          {field.operators[0].label}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {field.input === 'text' && (
          <Input
            value={rule.value ?? ''}
            autoFocus={autoFocus}
            placeholder={field.placeholder}
            aria-label={field.label}
            className="h-9 text-sm"
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
          />
        )}
        {field.input === 'choice' && (
          <Select value={rule.value} onValueChange={(value) => onChange({ ...rule, value })}>
            <SelectTrigger className="h-9 w-full text-sm" aria-label={field.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark">
              {field.choices?.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        sizeVariant="sm"
        className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
        aria-label={t('filter.custom.remove_condition', 'Remove condition')}
        disabled={!onRemove}
        onClick={onRemove}
      >
        <MonoIcon type="X" size={14} />
      </Button>
    </div>
  );
};

/**
 * Create or edit a custom label: a name plus the rules a conversation must
 * match to show under that tab. Opened from the "+" next to the inbox tabs,
 * a tab's right-click menu, or "Save as label" in the filter menu.
 */
const CustomLabelDialog: FC = () => {
  const { t } = useTranslation();
  const [editor, setEditor] = useAtom(customLabelEditorAtom);
  const [labels, setLabels] = useAtom(customLabelsAtom);
  const { activeFilters, setActiveFilters, getLabelIdsByName } = useThreadFilter();
  const { threadIds, threadsMap, setSelectedThreads } = useThreadAtom();
  const fields = useFieldConfigs();

  const editing = editor.open ? editor.label : undefined;
  const [name, setName] = useState('');
  const [rules, setRules] = useState<FilterCriteria[]>([EMPTY_RULE]);
  const [focusRow, setFocusRow] = useState(-1);
  const [hideFromInbox, setHideFromInbox] = useState(false);
  const [color, setColor] = useState<SplitColor>(SPLIT_COLORS[0]);

  useEffect(() => {
    if (!editor.open) return;
    setName(editor.label?.name ?? '');
    const start = editor.label?.rules ?? editor.initialRules ?? [];
    setRules(start.length > 0 ? start.map((r) => ({ ...r })) : [{ ...EMPTY_RULE }]);
    setFocusRow(-1);
    setHideFromInbox(editor.label?.hideFromInbox ?? false);
    setColor(
      isSplitColor(editor.label?.color)
        ? editor.label.color
        : nextSplitColor(labels.filter((l) => l.id !== editor.label?.id))
    );
    // Only when the editor opens: a label saved meanwhile mustn't reset the form.
  }, [editor]);

  const close = () => setEditor({ open: false });

  const completeRules = useMemo(
    () => rules.filter(isRuleComplete).map((r) => ({ ...r, value: r.value?.trim() || r.value })),
    [rules]
  );
  const trimmedName = name.trim();
  const nameTaken = labels.some(
    (l) => l.id !== editing?.id && l.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  // Another tab already shows exactly these conversations: two tabs with the
  // same rules can't both be the highlighted one.
  const builtInNames: Record<string, string> = {
    unread: t('filter.unread', 'Unread'),
    attachments: t('filter.with_attachments', 'With attachments')
  };
  const sameAsTab =
    completeRules.length === 0
      ? undefined
      : Object.entries(BUILT_IN_TAB_RULES).find(([, r]) => sameFilters(completeRules, r))?.[0];
  const duplicateOf = sameAsTab
    ? builtInNames[sameAsTab]
    : labels.find((l) => l.id !== editing?.id && sameFilters(completeRules, l.rules))?.name;
  const canSave = !!trimmedName && !nameTaken && completeRules.length > 0 && !duplicateOf;

  // How many conversations in the list as loaded match, while the rules are edited.
  const matchCount = useMemo(() => {
    if (completeRules.length === 0) return null;
    return threadIds.filter((id) => {
      const thread = threadsMap[id];
      return thread && threadMatchesFilters(thread, completeRules, getLabelIdsByName);
    }).length;
  }, [completeRules, threadIds, threadsMap, getLabelIdsByName]);

  const save = () => {
    if (!canSave) return;
    const saved: CustomLabel = {
      id: editing?.id ?? generateUUID(),
      name: trimmedName,
      rules: completeRules,
      ...(hideFromInbox ? { hideFromInbox: true } : {}),
      color
    };
    const wasShowing = editing ? sameFilters(activeFilters, editing.rules) : false;
    setLabels(editing ? labels.map((l) => (l.id === saved.id ? saved : l)) : [...labels, saved]);
    // Show the new label right away; an edited one keeps showing if it was.
    if (!editing || wasShowing) {
      setSelectedThreads([]);
      setActiveFilters(saved.rules);
    }
    close();
  };

  const updateRule = (index: number, rule: FilterCriteria) =>
    setRules((prev) => prev.map((r, i) => (i === index ? rule : r)));

  return (
    <Dialog open={editor.open} onOpenChange={(open) => !open && close()}>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="dark:border sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('filter.custom.edit_title', 'Edit label')
                : t('filter.custom.new_title', 'New label')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'filter.custom.description',
                'A tab next to All, Unread and With attachments that shows only the conversations matching every condition below.'
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="custom-label-name" className="text-sm font-medium">
                {t('filter.custom.name', 'Name')}
              </label>
              <Input
                id="custom-label-name"
                value={name}
                autoFocus
                maxLength={40}
                placeholder={t('filter.custom.name_placeholder', 'e.g. Students, Registrar, VIP')}
                className="h-9 text-sm"
                onChange={(e) => setName(e.target.value)}
              />
              {nameTaken && (
                <p className="text-xs text-destructive">
                  {t('filter.custom.name_taken', 'You already have a label with this name.')}
                </p>
              )}
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t('filter.custom.color', 'Color')}</legend>
              <div className="flex items-center gap-2">
                {SPLIT_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={color === option}
                    aria-label={t(`filter.custom.color_${option}`, option)}
                    onClick={() => setColor(option)}
                    className={cn(
                      'h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      SPLIT_COLOR_BG[option],
                      color === option && 'ring-2 ring-foreground'
                    )}
                  />
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t('filter.custom.conditions', 'Show conversations where')}
              </p>
              {rules.map((rule, index) => (
                <RuleRow
                  key={index}
                  rule={rule}
                  fields={fields}
                  autoFocus={index === focusRow}
                  onChange={(next) => updateRule(index, next)}
                  onRemove={
                    rules.length > 1
                      ? () => setRules((prev) => prev.filter((_, i) => i !== index))
                      : undefined
                  }
                />
              ))}
              <Button
                type="button"
                variant="ghost"
                sizeVariant="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setFocusRow(rules.length);
                  setRules((prev) => [...prev, { ...EMPTY_RULE }]);
                }}
              >
                <MonoIcon type="Plus" size={14} className="mr-1.5" />
                {t('filter.custom.add_condition', 'Add condition')}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t(
                  'filter.custom.logic_hint',
                  'All conditions must match. Two values for the same field match either one (From alice or From bob).'
                )}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <label htmlFor="custom-label-split" className="space-y-0.5">
                <span className="block text-sm font-medium">
                  {t('filter.custom.split', 'Only show here')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'filter.custom.split_hint',
                    'In the Inbox, these conversations show only under this tab, not under All, Unread or your other labels, like Outlook’s Other tab. When two such labels match a conversation, the one further left keeps it.'
                  )}
                </span>
              </label>
              <Switch
                id="custom-label-split"
                checked={hideFromInbox}
                onCheckedChange={setHideFromInbox}
              />
            </div>

            {duplicateOf && (
              <p className="text-xs text-destructive">
                {t('filter.custom.duplicate', {
                  name: duplicateOf,
                  defaultValue: 'The "{{name}}" tab already shows these conversations.'
                })}
              </p>
            )}

            <DialogFooter className="items-center gap-2 sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {matchCount !== null &&
                  t('filter.custom.match_count', {
                    count: matchCount,
                    defaultValue: '{{count}} conversations in the current list match'
                  })}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button type="submit" disabled={!canSave}>
                  {editing
                    ? t('filter.custom.save', 'Save')
                    : t('filter.custom.create', 'Create label')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default CustomLabelDialog;
