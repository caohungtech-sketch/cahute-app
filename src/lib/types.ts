export type Role = 'manager' | 'staff'
export type TaskStatus = 'todo' | 'in_progress' | 'paused' | 'done'

export interface Profile {
  id: string
  full_name: string
  role: Role
  team_id: string | null
  avatar_path: string | null
}

export interface Team {
  id: string
  name: string
  manager_id: string | null
}

export interface Task {
  id: string
  team_id: string
  title: string
  description: string
  status: TaskStatus
  created_by: string | null
  due_at: string | null
  created_at: string
  updated_at: string
  task_assignees: { user_id: string }[]
}

export interface Attachment {
  id: string
  storage_path: string
  width: number | null
  height: number | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  body: string
  created_at: string
  task_attachments: Attachment[]
}
