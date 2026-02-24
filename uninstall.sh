#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

MINI_BOT_HOME="$HOME/.mini-bot"
PLIST_PATH="$HOME/Library/LaunchAgents/com.mini-bot.plist"

echo ""
echo -e "${BOLD}${RED}  mini-bot 제거${NC}"
echo ""
echo -e "  제거 대상: ${DIM}$MINI_BOT_HOME${NC}"
echo ""
echo -ne "  ${YELLOW}?${NC} ${BOLD}정말 제거할까요?${NC} ${DIM}[y/N]${NC} "
IFS= read -r answer </dev/tty
answer="${answer:-n}"

if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  echo -e "\n  취소됨.\n"
  exit 0
fi

# launchd 제거 (macOS)
if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo -e "  ${GREEN}✓${NC} launchd 서비스 제거"
fi

# pm2 제거 (Linux)
if command -v pm2 &>/dev/null; then
  pm2 delete mini-bot 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

# 스킬은 보존 여부 확인
SKILLS_DIR="$MINI_BOT_HOME/skills"
if [ -d "$SKILLS_DIR" ] && [ "$(ls -A "$SKILLS_DIR" 2>/dev/null)" ]; then
  echo ""
  echo -ne "  ${YELLOW}?${NC} ${BOLD}사용자 스킬(${SKILLS_DIR})도 삭제할까요?${NC} ${DIM}[y/N]${NC} "
  IFS= read -r keep_skills </dev/tty
  keep_skills="${keep_skills:-n}"
  if [[ "$keep_skills" =~ ^[Yy]$ ]]; then
    DELETE_SKILLS=true
  else
    DELETE_SKILLS=false
  fi
else
  DELETE_SKILLS=true
fi

if [ "$DELETE_SKILLS" = "true" ]; then
  rm -rf "$MINI_BOT_HOME"
  echo -e "  ${GREEN}✓${NC} $MINI_BOT_HOME 삭제됨"
else
  rm -rf "$MINI_BOT_HOME/bot"
  rm -f "$MINI_BOT_HOME/.env.backup"
  echo -e "  ${GREEN}✓${NC} 봇 삭제됨 (스킬은 보존: $SKILLS_DIR)"
fi

echo ""
echo -e "  ${GREEN}✓${NC} mini-bot 제거 완료"
echo ""
