// tabConfigs.ts
import React, { ReactElement, ReactNode } from 'react';
import {
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Link as LinkIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import {
  Chip,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  SelectChangeEvent,
  ChipProps
} from '@mui/material';
// 타입을 임포트
import {
  PoCSourceInfo,
  RuleTypeInfo,
  BaseItem,
  PoCItem,
  SnortRuleItem,
  ReferenceItem,
  DataItem,
  ExtendedTabConfig
} from '../types/TabTypes';
// ChipLabel이 CommonStyles에 정의되어 있다고 가정
import { ChipLabel } from './CommonStyles'; // 경로 확인 필요

// --- PoC 탭 설정 ---
export const POC_SOURCES: Record<string, PoCSourceInfo> = {
  Etc: { label: 'Etc', color: 'default' },
  Metasploit: { label: 'Metasploit', color: 'secondary' },
  'Nuclei-Templates': { label: 'Nuclei Templates', color: 'primary' },
  GitHub: { label: 'GitHub', color: 'info' },
  ExploitDB: { label: 'Exploit-DB', color: 'warning' },
};

export const DEFAULT_POC: PoCItem = {
  source: 'Etc',
  url: '',
  description: '',
};

export const pocTabConfig: ExtendedTabConfig<PoCItem> = {
  icon: CodeIcon,
  title: 'Proof of Concept',
  itemName: 'PoC',
  dataField: 'pocs',
  wsFieldName: 'pocs',
  defaultItem: DEFAULT_POC,
  emptyTitle: '등록된 PoC 정보 없음',
  emptyDescription: '아직 이 취약점에 대한 PoC 코드가 등록되지 않았습니다.',
  addButtonText: 'PoC 추가',
  editButtonText: 'PoC 수정',
  deleteButtonText: 'PoC 삭제',
  validateItem: (item) => (item.url && item.url.trim() !== '') || 'URL은 필수 항목입니다.',
  checkDuplicate: (item, items, excludeIndex = -1) => {
    const currentUrl = item.url.trim().toLowerCase();
    return (items || []).some((poc, index) =>
      index !== excludeIndex && poc.url.trim().toLowerCase() === currentUrl
    );
  },
  
  renderItemLabel: (item: PoCItem): ReactElement => (
    <>
      <Chip
        label={
          <ChipLabel>
            <CodeIcon sx={{ fontSize: 16, mr: 0.5 }} />
            {POC_SOURCES[item.source]?.label || item.source}
          </ChipLabel>
        }
        size="small"
        color={POC_SOURCES[item.source]?.color || 'default'}
        variant="outlined"
        sx={{ minWidth: 80, mr: 1 }}
      />
      <Typography
        component="a"
        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          color: 'info.main',
          textDecoration: 'none',
          fontWeight: 400,
          wordBreak: 'break-all',
          '&:hover': { textDecoration: 'underline', color: 'info.dark' },
        }}
      >
        {item.url}
      </Typography>
    </>
  ),
  renderDialogContent: (item: PoCItem, updateItemState: <K extends keyof PoCItem>(item: PoCItem, field: K, value: PoCItem[K]) => void, isEdit: boolean): ReactElement => (
    <>
      <FormControl fullWidth margin="normal">
        <InputLabel id="poc-source-label">Source</InputLabel>
        <Select
          labelId="poc-source-label"
          value={item.source}
          onChange={(e: SelectChangeEvent) => updateItemState(item, 'source', e.target.value as string)}
          label="Source"
        >
          {Object.entries(POC_SOURCES).map(([value, { label }]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        margin="normal"
        label="URL"
        value={item.url}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItemState(item, 'url', e.target.value)}
        error={!item.url || item.url.trim() === ''}
        helperText={!item.url || item.url.trim() === '' ? "URL은 필수 입력 항목입니다." : ""}
        placeholder="https://example.com/poc"
      />
      <TextField
        fullWidth
        margin="normal"
        label="Description (Optional)"
        value={item.description || ''}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={3}
      />
    </>
  )
}; // 세미콜론 추가

// --- Snort Rules 탭 설정 ---
export const RULE_TYPES: Record<string, RuleTypeInfo> = {
  USER_DEFINED: { label: '사용자 정의', color: 'default' },
  IPS: { label: 'IPS', color: 'primary' },
  ONE: { label: 'ONE', color: 'secondary' },
  UTM: { label: 'UTM', color: 'success' },
  'Emerging-Threats': { label: 'Emerging Threats', color: 'warning' },
  SNORT_OFFICIAL: { label: 'Snort Official', color: 'info' }
};

export const DEFAULT_RULE: SnortRuleItem = {
  type: 'Emerging-Threats',
  rule: '',
  description: '',
};

export const snortRulesTabConfig: ExtendedTabConfig<SnortRuleItem> = {
  icon: ShieldIcon,
  title: 'Snort Rules',
  itemName: '규칙',
  dataField: 'snortRules',
  wsFieldName: 'snort_rules',
  defaultItem: DEFAULT_RULE,
  emptyTitle: '등록된 Snort 규칙 없음',
  emptyDescription: '아직 이 취약점에 대한 Snort 규칙이 정의되지 않았습니다.',
  addButtonText: '규칙 추가',
  editButtonText: '규칙 수정',
  deleteButtonText: '규칙 삭제',
  validateItem: (item) => (item.rule && item.rule.trim() !== '') || '규칙 내용은 필수 항목입니다.',
  prepareItemForSave: (item, isUpdate, kstTime) => {
    const now = kstTime?.toISOString() || new Date().toISOString();
    const username = item.currentUser?.username || 'anonymous';
    if (isUpdate) {
      return {
        id: item.id, // 수정 시 ID 포함
        type: item.type,
        rule: item.rule,
        description: item.description,
        last_modified_at: now,
        last_modified_by: username,
      };
    } else {
      return {
        type: item.type,
        rule: item.rule,
        description: item.description,
        created_at: now,
        created_by: username,
      };
    }
  },
  renderItemLabel: (item: SnortRuleItem): ReactElement => (
    <Chip
      label={
        <ChipLabel>
          <ShieldIcon sx={{ fontSize: 16, mr: 0.5 }} />
          {RULE_TYPES[item.type]?.label || item.type}
        </ChipLabel>
      }
      size="small"
      color={RULE_TYPES[item.type]?.color || 'default'}
      variant="outlined"
      sx={{ minWidth: 80 }}
    />
  ),
  renderItemContent: (item) => (
    <Typography
      variant="body2"
      component="pre"
      sx={{
        fontSize: '0.813rem',
        fontFamily: 'monospace',
        maxHeight: '6em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        m: 0, p: 0, lineHeight: 1.4,
      }}
    >
      {item.rule}
    </Typography>
  ),
  renderDialogContent: (item: SnortRuleItem, updateItemState: <K extends keyof SnortRuleItem>(item: SnortRuleItem, field: K, value: SnortRuleItem[K]) => void, isEdit: boolean): ReactElement => (
    <>
      <FormControl fullWidth margin="normal">
        <InputLabel id="rule-type-label">Type</InputLabel>
        <Select
          labelId="rule-type-label"
          value={item.type}
          onChange={(e: SelectChangeEvent) => updateItemState(item, 'type', e.target.value as string)}
          label="Type"
        >
          {Object.entries(RULE_TYPES).map(([value, { label }]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        margin="normal"
        label="Rule"
        value={item.rule}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateItemState(item, 'rule', e.target.value)}
        error={!item.rule || item.rule.trim() === ''}
        helperText={!item.rule || item.rule.trim() === '' ? "규칙 내용은 필수 입력 항목입니다." : ""}
        multiline
        rows={5}
        placeholder={`alert tcp any any -> any any (msg:"Example Rule"; sid:1000001;)`}
        InputProps={{ sx: { fontFamily: 'monospace' } }}
      />  
      <TextField
        fullWidth
        margin="normal"
        label="Description (Optional)"
        value={item.description || ''}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={2}
      />
    </>
  )
}; // 세미콜론 추가

// --- References 탭 설정 ---
export const REFERENCE_TYPES: Record<string, string> = {
  NVD: 'NVD',
  ADVISORY: 'Advisory',
  EXPLOIT: 'Exploit',
  PATCH: 'Patch',
  REPORT: 'Report',
  TOOL: 'Tool',
  OTHER: 'Other',
}; // 세미콜론 추가

export const DEFAULT_REFERENCE: ReferenceItem = {
  type: 'OTHER',
  url: '',
  description: '',
}; // 세미콜론 추가

export const referencesTabConfig: ExtendedTabConfig<ReferenceItem> = {
  icon: LinkIcon,
  title: 'References',
  itemName: '참조 링크',
  dataField: 'references',
  wsFieldName: 'references',
  defaultItem: DEFAULT_REFERENCE,
  emptyTitle: '등록된 참조 링크 없음',
  emptyDescription: '아직 이 취약점과 관련된 참조 링크가 등록되지 않았습니다.',
  addButtonText: '링크 추가',
  editButtonText: '링크 수정',
  deleteButtonText: '링크 삭제',
  validateItem: (item) => (item.url && item.url.trim() !== '') || 'URL은 필수 항목입니다.',
  checkDuplicate: (item, items, excludeIndex = -1) => {
    const currentUrl = item.url.trim().toLowerCase();
    return (items || []).some((ref, index) =>
      index !== excludeIndex && ref.url.trim().toLowerCase() === currentUrl
    );
  },
  renderItemLabel: (item: ReferenceItem): ReactElement => (
    <>
      <Chip
        label={REFERENCE_TYPES[item.type] || item.type}
        size="small"
        color="info"
        variant="outlined"
        sx={{ mr: 1 }}
      />
      <Typography
        component="a"
        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          color: 'info.main',
          textDecoration: 'none',
          fontWeight: 400,
          wordBreak: 'break-all',
          '&:hover': { textDecoration: 'underline', color: 'info.dark' },
        }}
      >
        {item.url}
      </Typography>
    </>
  ),
  renderDialogContent: (item: ReferenceItem, updateItemState: <K extends keyof ReferenceItem>(item: ReferenceItem, field: K, value: ReferenceItem[K]) => void, isEdit: boolean): ReactElement => (
    <>
      <FormControl fullWidth margin="normal">
        <InputLabel id="reference-type-label">Type</InputLabel>
        <Select
          labelId="reference-type-label"
          value={item.type}
          onChange={(e: SelectChangeEvent) => updateItemState(item, 'type', e.target.value as string)}
          label="Type"
        >
          {Object.entries(REFERENCE_TYPES).map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        margin="normal"
        label="URL"
        value={item.url}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItemState(item, 'url', e.target.value)}
        error={!item.url || item.url.trim() === ''}
        helperText={!item.url || item.url.trim() === '' ? "URL은 필수 입력 항목입니다." : ""}
        placeholder="https://example.com/reference"
      />
      <TextField
        fullWidth
        margin="normal"
        label="Description (Optional)"
        value={item.description || ''}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={3}
      />
    </>
  )
};