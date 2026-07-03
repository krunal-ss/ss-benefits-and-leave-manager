# PRD -- Smart Team Availability & Capacity Planner

## Executive Summary

Real-time team availability and capacity planning for Leave & WFH
approvals.

## Business Problem

Managers need staffing visibility before approvals.

## Goals

-   Real-time heatmap
-   Capacity planning
-   Conflict detection
-   Workforce insights

## Functional Requirements

-   Team calendar
-   Heatmap
-   Capacity summary
-   Leave conflict detection
-   Critical role protection
-   Department overview
-   Forecasting
-   Filters

## Business Rules

-   Exclude weekends/holidays
-   Half-day=50%
-   WFH counts available

## Database

TeamCapacity and StaffingThreshold tables.

## APIs

GET /availability/team/{teamId} GET /availability/calendar GET
/availability/forecast POST /availability/export

## UI

Manager dashboard, HR dashboard, Team heatmap.

## Notifications

Manager, Employee and HR alerts.

## Acceptance Criteria

Heatmap updates instantly, configurable thresholds, export support.

## Future Enhancements

AI staffing, Jira integration, predictive planning.
